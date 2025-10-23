import { Options, parseArguments, ParsingError, ServerMode } from 'common-components'
import fs from 'fs'
import { VERSION } from './constants'

const options: Options = {
  config: {
    type: 'string',
    default: () => `${process.env.HOME}/.cube/config.json`,
    validate: (value: string) => {
      return value.length > 5 && value.endsWith('.json')
    },
    alias: 'c',
  },
  help: {
    type: 'boolean',
    alias: 'h',
  },
  version: {
    type: 'boolean',
  },
  verbose: {
    type: 'boolean',
    alias: 'v',
  },
}

export type Config = {
  apiServerUrl: string
}

function validateConfig(config: any): Config {
  if (typeof config !== 'object' || config === null) {
    throw new Error('Config must be an object')
  }
  if (typeof config.apiServerUrl !== 'string' || !config.apiServerUrl.startsWith('http')) {
    throw new Error('Config must have a valid apiServerUrl string')
  }
  return config
}

export function parseArgs() {
  try {
    const args = parseArguments(process.argv.slice(2), options)
    if (!fs.existsSync(args.options.config)) {
      console.error(`Config file not found: ${args.options.config}`)
      process.exit(1)
    }
    try {
      const configContent = fs.readFileSync(args.options.config, 'utf-8')
      const config = JSON.parse(configContent)
      return {
        ...args,
        config: validateConfig(config),
      }
    } catch (err) {
      if (err instanceof Error) {
        console.error(`Error reading or parsing config file: ${err.message}`)
        process.exit(1)
      } else {
        throw err
      }
    }
  } catch (err) {
    if (err instanceof ParsingError) {
      console.error(`Error parsing arguments: ${err.message}`)
      process.exit(1)
    }
    throw err
  }
}

export function printHelp() {
  const beforeOption = 'usage: cube'
  console.log(`${beforeOption} [options]`)
  const padding = String(' ').repeat(beforeOption.length)
  console.log(`${padding} -h, --help           Show help`)
  console.log(`${padding} --version            Show version`)
  console.log(`${padding} -v, --verbose        Enable verbose output`)
  console.log(`${padding} -c, --config <path>  Path to config file (default: ~/.cube/config.json)`)
}

export function printVersion() {
  console.log(`Running version of cube is ${VERSION}`)
}
