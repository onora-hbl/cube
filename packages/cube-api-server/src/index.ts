import logger from './utils/logger.js'
import Fastify, { type FastifyError } from 'fastify'
import type { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts'
import dbPlugin from './utils/dbPlugin.js'
import resourcesStorePlugin, { NotAuthorizedError, ResourceAlreadyExistsError } from './utils/resourcesStore.js'
import watchManagerPlugin from './utils/watchManager.js'
import {
  CreateResourceDefinitionSchema,
  CubeRole,
  ResourceDefinitionSchema,
  type CreateAnyResourceDefinition,
  type ResourceDefinition,
  type ResourceKind,
} from 'cube-types'
import { getRoleFromToken } from './utils/auth.js'

const PORT = 3000

let isAppReady = false

declare module 'fastify' {
  interface FastifyRequest {
    role: CubeRole | null
  }
}

async function main() {
  const app = Fastify().withTypeProvider<JsonSchemaToTsProvider>()

  app.decorateRequest('role', null)

  await app.register(dbPlugin, { filePath: '/tmp/cube-db.sqlite' })
  await app.register(watchManagerPlugin)
  await app.register(resourcesStorePlugin)

  app.addHook('onReady', () => {
    isAppReady = true
  })

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      const err = {
        code: 'BAD_REQUEST',
        message: 'Invalid request data - ' + JSON.stringify(error.validation),
      }
      reply.status(400).send(err)
    } else {
      logger.error({ err: error }, `Error in request ${request.method} ${request.url}`)
      const errorResponse = {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      }
      reply.status(500).send(errorResponse)
    }
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
      401: { status: 'not_autorized' }
      403: { status: 'forbidden' }
      409: { status: 'conflict' }
    }
    Headers: {
      authorization: string
    }
  }>({
    method: 'POST',
    url: '/resource',
    schema: {
      body: CreateResourceDefinitionSchema,
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' },
        },
        required: ['authorization'],
      },
      response: {
        201: {
          type: 'object',
          properties: {
            resource: ResourceDefinitionSchema,
          },
          required: ['resource'],
          additionalProperties: false,
        },
        401: {
          type: 'object',
          properties: {
            status: {
              enum: ['not_autorized'],
            },
          },
          required: ['status'],
          additionalProperties: false,
        },
        403: {
          type: 'object',
          properties: {
            status: {
              enum: ['forbidden'],
            },
          },
          required: ['status'],
          additionalProperties: false,
        },
        409: {
          type: 'object',
          properties: {
            status: {
              enum: ['conflict'],
            },
          },
          required: ['status'],
          additionalProperties: false,
        },
      },
    },
    preHandler: async (request, reply) => {
      const authHeader = request.headers.authorization
      if (!authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ status: 'not_autorized' })
      }
      const role = getRoleFromToken(authHeader.substring('Bearer '.length))
      if (role == null) {
        return reply.code(403).send({ status: 'forbidden' })
      }
      request.role = role
    },
    handler: async (request, reply) => {
      try {
        const definition = app.resourcesStore.createResource(request.body, request.role as CubeRole)
        return reply.code(201).send({ resource: definition })
      } catch (e) {
        if (e instanceof NotAuthorizedError) {
          return reply.code(403).send({ status: 'forbidden' })
        } else if (e instanceof ResourceAlreadyExistsError) {
          return reply.code(409).send({ status: 'conflict' })
        } else {
          throw e
        }
      }
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
