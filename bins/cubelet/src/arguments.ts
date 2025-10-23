import { SERVER_VERSION } from './constants'
import { Options, parseArguments, ParsingError } from 'common-components'
import logger from './logger'

const validatePortNumber = (n: number) => n > 0 && n <= 65535

const options: Options = {
  apiServerHost: {
    type: 'string',
    required: true,
  },
  apiServerPort: {
    type: 'number',
    validate: validatePortNumber,
    default: 4242,
  },
  help: {
    type: 'boolean',
    alias: 'h',
  },
  version: {
    type: 'boolean',
    alias: 'v',
  },
  name: {
    type: 'string',
    required: true,
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
  const beforeOption = 'usage: cube-server'
  console.log(`${beforeOption} [options]`)
  const padding = String(' ').repeat(beforeOption.length)
  console.log(`${padding} -h, --help           Show help`)
  console.log(`${padding} -v, --version        Show version`)
  console.log(`${padding} -p, --port <number>  Port to run the cubelet server on (default: 4243)`)
  console.log(`${padding} --apiServerHost <string>  Host of the API server to connect to`)
  console.log(
    `${padding} --apiServerPort <number>  Port of the API server to connect to (default: 4242)`,
  )
  console.log(`${padding} --name <string>      Name of the cubelet node`)
}

export function printVersion() {
  console.log(`Running version of cube-server is ${SERVER_VERSION}`)
}
