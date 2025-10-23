import {
  ApiServerApiHealthEndpoint,
  ApiServerApiRegisterNodeEndpoint,
  BaseErrorCode,
  CubeApiServerStatus,
  InferError,
  InferResponse,
} from 'common-components'
import { parseArgs, printHelp, printVersion } from './arguments'
import logger from './logger'
import Fastify from 'fastify'
import databasePlugin from './fastifyPlugins/databasePlugin'
import { hearthbeatHandler, listNodes, registerNodeHandler } from './endpoints/node'
import nodesPlugin from './fastifyPlugins/nodesPlugin'
import {
  ApiServerApiHeartbeatEndpoint,
  ApiServerApiListNodesEndpoint,
} from 'common-components/dist/api/api-server/node'

let isAppReady = false

async function main() {
  const args = parseArgs()
  if (args.options.help) {
    printHelp()
    process.exit(0)
  }
  if (args.options.version) {
    printVersion()
    process.exit(0)
  }

  const app = Fastify()

  await app.register(databasePlugin, { filePath: args.options.database })
  await app.register(nodesPlugin)

  app.addHook('onReady', () => {
    isAppReady = true
  })

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      const err: { code: BaseErrorCode; message: string } = {
        code: 'BAD_REQUEST',
        message: 'Invalid request data - ' + JSON.stringify(error.validation),
      }
      reply.status(400).send(err)
    } else {
      logger.error({ err: error }, `Error in request ${request.method} ${request.url}`)
      const errorResponse: { code: BaseErrorCode; message: string } = {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      }
      reply.status(500).send(errorResponse)
    }
  })

  app.route({
    method: ApiServerApiHealthEndpoint.method,
    url: ApiServerApiHealthEndpoint.url,
    schema: ApiServerApiHealthEndpoint.schema,
    handler: async (_, reply) => {
      if (!isAppReady) {
        const err: InferError<typeof ApiServerApiHealthEndpoint> = {
          code: 'NOT_READY',
          message: 'Server not reported as ready',
        }
        return reply.status(503).send(err)
      }
      const res: InferResponse<typeof ApiServerApiHealthEndpoint> = {
        status: CubeApiServerStatus.OK,
      }
      return reply.send(res)
    },
  })

  app.route({
    method: ApiServerApiRegisterNodeEndpoint.method,
    url: ApiServerApiRegisterNodeEndpoint.url,
    schema: ApiServerApiRegisterNodeEndpoint.schema,
    handler: async (request, reply) => {
      await registerNodeHandler(app, request, reply)
    },
  })

  app.route({
    method: ApiServerApiHeartbeatEndpoint.method,
    url: ApiServerApiHeartbeatEndpoint.url,
    schema: ApiServerApiHeartbeatEndpoint.schema,
    handler: async (request, reply) => {
      await hearthbeatHandler(app, request, reply)
    },
  })

  app.route({
    method: ApiServerApiListNodesEndpoint.method,
    url: ApiServerApiListNodesEndpoint.url,
    schema: ApiServerApiListNodesEndpoint.schema,
    handler: async (request, reply) => {
      await listNodes(app, request, reply)
    },
  })

  await app.listen({
    port: args.options.port,
  })
  logger.info(`Cube api-server is running on port ${args.options.port}`)
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup')
  process.exit(1)
})
