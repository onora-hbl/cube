import { ApiServerApiHealthEndpoint, CubeApiServerStatus, InferResponse } from 'common-components'
import { parseArgs, printHelp, printVersion } from './arguments'
import { executeCommand } from './cli'

export class HealthCheckError extends Error {
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'HealthCheckError'
  }
}

async function healthCheckApiServer(host: string) {
  const res = await fetch(`${host}${ApiServerApiHealthEndpoint.url}`, {
    method: ApiServerApiHealthEndpoint.method,
  })
  if (!res.ok) {
    throw new HealthCheckError(
      `Health check to node at ${host} failed with status ${res.status}`,
      res.status,
    )
  }
  const healthData: InferResponse<typeof ApiServerApiHealthEndpoint> = await res.json()
  return healthData
}

let verbose = false

export function isVerbose() {
  return verbose
}

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
  if (args.options.verbose) {
    verbose = true
  }

  try {
    const healthData = await healthCheckApiServer(args.config.apiServerUrl)
    if (healthData.status !== CubeApiServerStatus.OK) {
      throw new HealthCheckError(
        `Health check to api server at ${args.config.apiServerUrl} returned status ${healthData.status}`,
      )
    }
  } catch (e) {
    if (e instanceof HealthCheckError) {
      console.error(`Health check failed: ${e.message}`)
      process.exit(1)
    } else {
      console.error(`Unexpected error during health check: ${(e as Error).message}`)
      process.exit(1)
    }
  }

  if (isVerbose()) {
    console.log('Health check to api server succeeded')
  }

  await executeCommand(args.args, args.config)

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
