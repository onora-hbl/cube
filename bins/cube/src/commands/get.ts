import {
  CubeletApiGetEndpoint,
  InferError,
  InferResponse,
  ResourcesTypes,
  ResourceType,
} from 'common-components'
import { Config } from '../arguments'
import { printTable } from '../utils/table'

export async function getCmd(args: string[], config: Config) {
  if (args.length != 1) {
    console.error('Usage: cube get <resource-type>')
    process.exit(1)
  }
  const type = args[0]
  if (!ResourcesTypes.includes(type as ResourceType)) {
    console.error(`Unknown resource type: ${type}`)
    process.exit(1)
  }
  const res = await fetch(`${config.leaderUrl}${CubeletApiGetEndpoint.formatUrl({ type })}`, {
    method: CubeletApiGetEndpoint.method,
  })
  if (!res.ok) {
    const err = (await res.json()) as InferError<typeof CubeletApiGetEndpoint>
    console.error(err.message)
    process.exit(1)
  }
  const data = (await res.json()) as InferResponse<typeof CubeletApiGetEndpoint>
  const table = data.resources.map((r) => ({
    name: r.name,
    ...r.overview,
  }))
  printTable(table)
}
