import { InferResponse } from 'common-components'
import { Config } from '../arguments'
import { printTable } from '../utils/table'
import {
  ApiServerApiListNodesEndpoint,
  NodeStatus,
} from 'common-components/dist/api/api-server/node'

const nodesStatusPrettyMap: Record<NodeStatus, string> = {
  [NodeStatus.READY]: 'Healthy',
  [NodeStatus.NOT_READY]: 'Unhealthy',
}

export async function nodesCmd(args: string[], config: Config) {
  const res = await fetch(`${config.apiServerUrl}${ApiServerApiListNodesEndpoint.url}`, {
    method: ApiServerApiListNodesEndpoint.method,
  })
  if (!res.ok) {
    console.error(`Failed to fetch nodes from api server: ${res.status}`)
    process.exit(1)
  }
  const nodesData = (await res.json()) as InferResponse<typeof ApiServerApiListNodesEndpoint>
  const nodesTable = nodesData.nodes.map((node) => ({
    name: node.name,
    status: nodesStatusPrettyMap[node.status],
    cpus: node.cpuCores.toString(),
    'cpu usage': `${node.cpuUsagePercent.toFixed(2)}%`,
    'memory usage (MB)': `${node.memoryUsageMb.toFixed(2)} (${(
      (node.memoryUsageMb / node.memoryMb) *
      100
    ).toFixed(2)}%)`,
  }))
  printTable(nodesTable)
}
