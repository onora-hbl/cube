import { parseArgs, printHelp, printVersion, ServerMode } from './arguments'
import logger from './logger'
import Fastify from 'fastify'
import commonEndpoints from './endpoints/common'
import leaderEndpoints from './endpoints/leader'
import argsPlugin from './fastifyPlugins/argsPlugin'

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

  await app.register(argsPlugin, {
    parsedOptions: {
      token: args.options.token,
      mode: args.options.mode,
      leaderHost: args.options.leaderHost,
      leaderPort: args.options.leaderPort,
    },
  })

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
