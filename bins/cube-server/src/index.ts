import { parseArgs, printHelp, printVersion } from './arguments'
import logger from './logger'

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
  console.log(args)
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup')
  process.exit(1)
})
