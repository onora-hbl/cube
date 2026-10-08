import logger from './utils/logger.js'
import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify'
import type { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts'
import dbPlugin from './utils/dbPlugin.js'
import resourcesStorePlugin from './utils/resourcesStore.js'
import watchManagerPlugin, { type Filter } from './utils/watchManager.js'
import {
  CreateResourceDefinitionSchema,
  CubeRole,
  ResourceDefinitionSchema,
  type CreateAnyResourceDefinition,
  type ResourceDefinition,
  type ResourceKind,
} from 'cube-types'
import { getRoleFromToken } from './utils/auth.js'
import { wrapPatch } from './utils/mergeUtils.js'
import { CubeError, ForbiddenError, NotAuthorizedError, ResourceVersionGoneError } from './utils/errors.js'
import { getFilterFromFieldSelector } from './utils/fieldSelectorUtils.js'
import nodeLifecycleControllerPlugin from './nodeLifecycleController.js'
import podSchedulerPlugin from './podScheduler.js'

const PORT = 3000

let isAppReady = false

declare module 'fastify' {
  interface FastifyRequest {
    role: CubeRole | null
  }
}

const authenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
  const authHeader = request.headers.authorization
  if (authHeader == null) {
    throw new NotAuthorizedError('Authorization header is missing')
  }
  if (!authHeader.startsWith('Bearer ')) {
    throw new NotAuthorizedError('Authorization header must start with "Bearer "')
  }
  const role = getRoleFromToken(authHeader.substring('Bearer '.length))
  if (role == null) {
    throw new ForbiddenError('Invalid token')
  }
  request.role = role
}

async function main() {
  const app = Fastify().withTypeProvider<JsonSchemaToTsProvider>()

  app.decorateRequest('role', null)

  await app.register(dbPlugin, { filePath: '/tmp/cube-db.sqlite' })
  await app.register(watchManagerPlugin)
  await app.register(resourcesStorePlugin)
  await app.register(nodeLifecycleControllerPlugin)
  await app.register(podSchedulerPlugin)

  app.addHook('onReady', () => {
    isAppReady = true
  })

  app.setErrorHandler<FastifyError | CubeError>((error, request, reply) => {
    if (error instanceof CubeError) {
      return error.writeReply(reply)
    }
    if (error.validation) {
      const err = {
        code: 'BAD_REQUEST',
        message: 'Invalid request data - ' + JSON.stringify(error.validation),
      }
      return reply.status(400).send(err)
    }
    logger.error({ err: error }, `Error in request ${request.method} ${request.url}`)
    const errorResponse = {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    }
    return reply.status(500).send(errorResponse)
  })

  app.route({
    method: 'GET',
    url: '/health',
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: {
              enum: ['ok'],
            },
          },
          required: ['status'],
          additionalProperties: false,
        },
        503: {
          type: 'object',
          properties: {
            code: {
              enum: ['NOT_READY'],
            },
            message: {
              type: 'string',
            },
          },
          required: ['code', 'message'],
          additionalProperties: false,
        },
      },
    },
    handler: async (_, reply) => {
      if (isAppReady) {
        return reply.code(200).send({ status: 'ok' })
      }
      return reply.code(503).send({ code: 'NOT_READY', message: 'Cube API server is not ready yet' })
    },
  })

  app.route<{
    Body: CreateAnyResourceDefinition
    Reply: {
      201: { resource: ResourceDefinition<ResourceKind> }
    }
  }>({
    method: 'POST',
    url: '/resource',
    schema: {
      body: CreateResourceDefinitionSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            resource: ResourceDefinitionSchema,
          },
          required: ['resource'],
          additionalProperties: false,
        },
      },
    },
    preHandler: authenticate,
    handler: async (request, reply) => {
      const definition = app.resourcesStore.createResource(request.body, request.role as CubeRole)
      return reply.code(201).send({ resource: definition })
    },
  })

  for (const url of ['/resource/:kind/:name', '/resource/:kind/:name/*']) {
    app.route<{
      Params: { kind: ResourceKind; name: string; '*'?: string }
      Body: unknown
    }>({
      method: 'PATCH',
      url,
      schema: {
        params: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['node', 'pod'],
            },
            name: { type: 'string' },
          },
          required: ['kind', 'name'],
        },
      },
      preHandler: authenticate,
      handler: async (request, reply) => {
        const path = (request.params['*'] ?? '').split('/').filter(Boolean)
        const patch = wrapPatch(path, request.body)
        const resource = app.resourcesStore.patchResource(
          { kind: request.params.kind, name: request.params.name, patch },
          request.role as CubeRole,
        )
        return reply.code(200).send({ resource })
      },
    })
  }

  app.route({
    method: 'DELETE',
    url: '/resource/:kind/:name',
    schema: {
      params: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['node', 'pod'],
          },
          name: { type: 'string' },
        },
        required: ['kind', 'name'],
      },
    },
    preHandler: authenticate,
    handler: async (request, reply) => {
      const resource = app.resourcesStore.markResourceForDeletion(
        request.params.kind,
        request.params.name,
        request.role as CubeRole,
      )
      return reply.code(200).send({ resource })
    },
  })

  app.route({
    method: 'GET',
    url: '/resource/:kind',
    schema: {
      querystring: {
        type: 'object',
        properties: {
          watch: { type: 'boolean', default: false },
          fieldSelector: { type: 'string' },
          resourceVersion: { type: 'number' },
        },
        additionalProperties: false,
      },
      params: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['node', 'pod'],
          },
          name: { type: 'string' },
        },
        required: ['kind'],
      },
    },
    preHandler: authenticate,
    handler: (request, reply) => {
      const { kind } = request.params
      const filter = request.query.fieldSelector
        ? getFilterFromFieldSelector(kind, request.query.fieldSelector)
        : undefined
      if (!request.query.watch) {
        return reply.code(200).send({ resources: app.resourcesStore.listResources(kind, filter) })
      }

      if (
        request.query.resourceVersion != null &&
        !app.watchManager.isResourceVersionKnown(request.query.resourceVersion)
      ) {
        throw new ResourceVersionGoneError(request.query.resourceVersion)
      }

      reply.hijack()
      reply.raw.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })
      reply.raw.flushHeaders()

      const unsubscribe = app.watchManager.subscribe(
        kind,
        (event) => {
          reply.raw.write(`${JSON.stringify(event)}\n`)
        },
        filter,
        request.query.resourceVersion,
      )
      reply.raw.on('close', unsubscribe)
      return reply
    },
  })

  logger.debug('Routes tree:\n' + app.printRoutes())

  await app.listen({
    port: PORT,
  })
  logger.info(`Cube api-server is running on port ${String(PORT)}`)
}

main().catch((err: unknown) => {
  logger.error(err, 'Error starting Cube API server')
  process.exitCode = 1
})
