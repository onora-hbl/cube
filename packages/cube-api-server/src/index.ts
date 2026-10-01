import logger from './utils/logger.js'
import Fastify, { type FastifyError } from 'fastify'
import type { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts'
import dbPlugin from './utils/dbPlugin.js'

const PORT = 3000

let isAppReady = false

async function main() {
  const app = Fastify().withTypeProvider<JsonSchemaToTsProvider>()

  await app.register(dbPlugin, { filePath: '/tmp/cube-db.sqlite' })

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
