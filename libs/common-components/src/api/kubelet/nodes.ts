import { defineEndpoint } from '../common'
import { ServerMode } from './health'

export enum NodeStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
  UNAVAILABLE = 'unavailable',
}

type CubeNode = {
  name: string
  status: NodeStatus
  mode: ServerMode
}

type CubeNodesResponse = {
  nodes: CubeNode[]
}

export const CubeletApiNodesEndpoint = defineEndpoint({
  method: 'GET',
  url: '/api/nodes',
  requestBody: undefined,
  responseBody: {} as CubeNodesResponse,
  errors: [] as const,
})
