import { SERVER_VERSION } from './constants'
import { Options, parseArguments, ParsingError, ServerMode } from 'common-components'
import logger from './logger'

const validatePortNumber = (n: number) => n > 0 && n <= 65535

const options: Options = {
  token: {
    type: 'string',
    default: () => crypto.randomUUID(),
    alias: 't',
  },
  mode: {
    type: 'string',
    default: ServerMode.FOLLOWER,
    validate: (value: string) => Object.values(ServerMode).includes(value as ServerMode),
    alias: 'm',
  },
  port: {
    type: 'number',
    default: 4242,
    validate: validatePortNumber,
    alias: 'p',
  },
  leaderHost: {
    type: 'string',
  },
  leaderPort: {
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
}

export function parseArgs() {
  try {
    const args = parseArguments(process.argv.slice(2), options)
    if (args.options.mode === ServerMode.FOLLOWER && args.options.leaderHost == null) {
      throw new ParsingError('leaderHost option is required in follower mode')
    }
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
  console.log(
    `${padding} --mode <mode>        Set server mode (leader or follower). Default is follower`,
  )
  console.log(
    `${padding} --token <token>      Set authentication token (at least 20 characters recommended)`,
  )
  console.log(`${padding} --port <port>        Set port to listen on. Default is 4242`)
  console.log(`${padding} --leaderHost <host>  Host of the leader server if follower mode`)
  console.log(
    `${padding} --leaderPort <port>  Port of the leader server if follower mode. Default is 4242`,
  )
}

export function printVersion() {
  console.log(`Running version of cube-server is ${SERVER_VERSION}`)
}
