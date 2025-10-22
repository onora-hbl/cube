import { CubeletApiNodesEndpoint, InferResponse } from 'common-components'
import { Config } from '../arguments'
import { printTable } from '../utils/table'

export async function nodesCmd(args: string[], config: Config) {
  const res = await fetch(`${config.leaderUrl}${CubeletApiNodesEndpoint.url}`, {
    method: CubeletApiNodesEndpoint.method,
  })
  if (!res.ok) {
    console.error(`Failed to fetch nodes from leader at ${config.leaderUrl}: ${res.status}`)
    process.exit(1)
  }
  const nodesData = (await res.json()) as InferResponse<typeof CubeletApiNodesEndpoint>
  printTable(nodesData.nodes)
}
