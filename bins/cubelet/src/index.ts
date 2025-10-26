import { parseArgs, printHelp, printVersion } from './arguments'
import logger from './logger'
import { ApiServer } from './utils/ApiServer'
import { EventBus } from './utils/EventBus'
import { NodeAgent } from './utils/NodeAgent'

let apiServer: ApiServer | null = null
let eventBus: EventBus | null = null
let nodeAgent: NodeAgent | null = null

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

  apiServer = new ApiServer(
    args.options.apiServerHost,
    args.options.apiServerPort,
    args.options.name,
  )
  await apiServer.initialize()

  eventBus = new EventBus(args.options.apiServerHost, args.options.apiServerPort, args.options.name)
  nodeAgent = new NodeAgent(eventBus)
  await eventBus.connect()

  logger.info(`Cubelet is running`)

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

function shutdown() {
  logger.info(`Shutting down Cubelet...`)
  if (apiServer) {
    apiServer[Symbol.dispose]()
  }
  if (eventBus) {
    eventBus[Symbol.dispose]()
  }
  logger.info(`Cubelet has shut down`)
}

process.on('SIGINT', () => {
  shutdown()
  process.exit(0)
})

process.on('SIGTERM', () => {
  shutdown()
  process.exit(0)
})

process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error) {
    logger.error({ err: reason }, `Unhandled Promise Rejection`)
  } else {
    logger.error(`Unhandled Promise Rejection: ${reason}`)
  }
  shutdown()
  process.exit(1)
})

main().catch((err) => {
  logger.error({ err }, `Fatal error during initialization`)
  process.exit(1)
})
