import { API_SERVER_VERSION } from './constants'
import { Options, parseArguments, ParsingError, ServerMode } from 'common-components'
import logger from './logger'

const validatePortNumber = (n: number) => n > 0 && n <= 65535

const options: Options = {
  port: {
    type: 'number',
    default: 4242,
    validate: validatePortNumber,
    alias: 'p',
  },
  help: {
    type: 'boolean',
    alias: 'h',
  },
  version: {
    type: 'boolean',
    alias: 'v',
  },
  database: {
    type: 'string',
    alias: 'd',
    default: '/opt/cube/data/cube.db',
  },
}

export function parseArgs() {
  try {
    const args = parseArguments(process.argv.slice(2), options)
    return args
  } catch (err) {
    if (err instanceof ParsingError) {
      logger.error(`Parsing error: ${err.message}`)
      process.exit(1)
    }
    throw err
  }
}

export function printHelp() {
  const beforeOption = 'usage: cube-api-server'
  console.log(`${beforeOption} [options]`)
  const padding = String(' ').repeat(beforeOption.length)
  console.log(`${padding} -h, --help           Show help`)
  console.log(`${padding} -v, --version        Show version`)
  console.log(`${padding} -p, --port <number>   Port number to run the server on (default: 4242)`)
  console.log(
    `${padding} -d, --database <path> Path to the database file (default: /opt/cube/data/cube.db)`,
  )
}

export function printVersion() {
  console.log(`Running version of cube-api-server is ${API_SERVER_VERSION}`)
}
