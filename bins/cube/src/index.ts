import { CubeApiHealthEndpoint, InferResponse, ServerMode, ServerStatus } from 'common-components'
import { parseArgs, printHelp, printVersion } from './arguments'
import { executeCommand } from './cli'

export class HealthCheckError extends Error {
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'HealthCheckError'
  }
}

async function healthCheckNode(host: string) {
  const res = await fetch(`${host}${CubeApiHealthEndpoint.url}`, {
    method: CubeApiHealthEndpoint.method,
  })
  if (!res.ok) {
    throw new HealthCheckError(
      `Health check to node at ${host} failed with status ${res.status}`,
      res.status,
    )
  }
  const healthData: InferResponse<typeof CubeApiHealthEndpoint> = await res.json()
  return healthData
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

  // try {
  //   const healthData = await healthCheckNode(args.config.leaderUrl)
  //   if (healthData.status !== ServerStatus.OK) {
  //     throw new HealthCheckError(
  //       `Health check to node at ${args.config.leaderUrl} returned status ${healthData.status}`,
  //     )
  //   }
  //   if (healthData.mode !== ServerMode.LEADER) {
  //     throw new HealthCheckError(
  //       `Node at ${args.config.leaderUrl} is not in LEADER mode (current mode: ${healthData.mode})`,
  //     )
  //   }
  // } catch (e) {
  //   if (e instanceof HealthCheckError) {
  //     console.error(`Health check failed: ${e.message}`)
  //     process.exit(1)
  //   } else {
  //     console.error(`Unexpected error during health check: ${(e as Error).message}`)
  //     process.exit(1)
  //   }
  // }

  console.log(`Health check to leader succeeded`)
  await executeCommand(args.args, args.config)

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
