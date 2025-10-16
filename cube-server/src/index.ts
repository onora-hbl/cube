import logger from './logger'

async function main() {
  logger.info('Cube server started')
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup')
  process.exit(1)
})
