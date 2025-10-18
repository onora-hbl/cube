import { CubeApiNodesEndpoint, InferResponse } from 'common-components'
import { Config } from '../arguments'

export async function nodesCmd(args: string[], config: Config) {
  const res = await fetch(`${config.leaderUrl}${CubeApiNodesEndpoint.url}`, {
    method: CubeApiNodesEndpoint.method,
  })
  if (!res.ok) {
    console.error(`Failed to fetch nodes from leader at ${config.leaderUrl}: ${res.status}`)
    process.exit(1)
  }
  const nodesData = (await res.json()) as InferResponse<typeof CubeApiNodesEndpoint>
  const maxNameLength = Math.max(...nodesData.nodes.map((node) => node.name.length), 'Name'.length)
  const maxStatusLength = Math.max(
    ...nodesData.nodes.map((node) => node.status.length),
    'Status'.length,
  )
  const maxModeLength = Math.max(...nodesData.nodes.map((node) => node.mode.length), 'Mode'.length)

  function capitalizeFirstLetter(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  function getNamePadded(name: string) {
    return name + ' '.repeat(maxNameLength - name.length)
  }

  function getStatusPadded(status: string) {
    return capitalizeFirstLetter(status) + ' '.repeat(maxStatusLength - status.length)
  }

  function getModePadded(mode: string) {
    return capitalizeFirstLetter(mode) + ' '.repeat(maxModeLength - mode.length)
  }

  console.log(`${getNamePadded('Name')} | ${getStatusPadded('Status')} | ${getModePadded('Mode')}`)
  console.log(
    '-'.repeat(maxNameLength),
    '|',
    '-'.repeat(maxStatusLength),
    '|',
    '-'.repeat(maxModeLength),
  )
  for (const node of nodesData.nodes) {
    console.log(
      `${getNamePadded(node.name)} | ${getStatusPadded(node.status)} | ${getModePadded(node.mode)}`,
    )
  }
}
