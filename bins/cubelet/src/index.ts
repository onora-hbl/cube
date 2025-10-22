import { parseArgs, printHelp, printVersion } from './arguments'
import logger from './logger'
import Fastify from 'fastify'
import { BaseErrorCode } from 'common-components'
import apiServerPlugin from './fastifyPlugins/apiServerPlugin'

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

  await app.register(apiServerPlugin, {
    host: args.options.apiServerHost!,
    port: args.options.apiServerPort!,
    name: args.options.name!,
  })

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

  await app.listen({
    port: args.options.port,
  })
  logger.info(`Cubelet is running on port ${args.options.port}`)
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup')
  process.exit(1)
})
