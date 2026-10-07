import Fastify, { type FastifyError } from 'fastify'
import type { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts'
import { CubeError } from './utils/errors.js'
import logger from './utils/logger.js'
import apiServerPlugin from './apiServer.js'

const PORT = 3042
const API_SERVER_URL = '127.0.0.1:3000'
const SELF_URL = '127.0.0.1'

let isAppReady = false

async function main() {
  const app = Fastify().withTypeProvider<JsonSchemaToTsProvider>()

  await app.register(apiServerPlugin, {
    url: API_SERVER_URL,
    selfIp: SELF_URL,
    selfPort: PORT,
    token: 'cube-cubelet-token',
    name: 'cubelet-1',
  })

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
      return reply.code(503).send({ code: 'NOT_READY', message: 'Cubelet server is not ready yet' })
    },
  })

  logger.debug('Routes tree:\n' + app.printRoutes())

  await app.listen({
    port: PORT,
  })
  logger.info(`Cubelet is running on port ${String(PORT)}`)

  await app.apiServer.selfRegister()
}

main().catch((err: unknown) => {
  logger.error(err, 'Error starting Cubelet server')
  process.exitCode = 1
})
