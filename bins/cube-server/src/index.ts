import { parseArgs, printHelp, printVersion } from './arguments'
import logger from './logger'
import Fastify from 'fastify'
import commonEndpoints from './endpoints/common'
import leaderEndpoints from './endpoints/leader'
import argsPlugin from './fastifyPlugins/argsPlugin'
import databasePlugin from './fastifyPlugins/databasePlugin'
import { BaseErrorCode, ServerMode } from 'common-components'
import nodesPlugin from './fastifyPlugins/nodesPlugin'
import resourcesPlugin from './fastifyPlugins/resourcesPlugin'

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

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      const error: { code: BaseErrorCode; message: string } = {
        code: 'BAD_REQUEST',
        message: 'Invalid request data',
      }
      reply.status(400).send(error)
    } else {
      logger.error({ err: error }, `Error in request ${request.method} ${request.url}`)
      const errorResponse: { code: BaseErrorCode; message: string } = {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      }
      reply.status(500).send(errorResponse)
    }
  })

  await app.register(argsPlugin, {
    parsedOptions: {
      token: args.options.token,
      mode: args.options.mode,
      leaderHost: args.options.leaderHost,
      leaderPort: args.options.leaderPort,
      port: args.options.port,
      name: args.options.name,
    },
  })

  await app.register(databasePlugin, {
    filePath: args.options.database,
  })

  await app.register(nodesPlugin)

  await app.register(resourcesPlugin)

  await app.register(commonEndpoints)
  logger.debug('Registered common endpoints')

  if (args.options.mode === ServerMode.LEADER) {
    await app.register(leaderEndpoints)
    logger.debug('Registered leader endpoints')
  }

  await app.listen({
    port: args.options.port,
  })
  logger.info(`Cube server is running in ${args.options.mode} mode on port ${args.options.port}`)
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup')
  process.exit(1)
})
