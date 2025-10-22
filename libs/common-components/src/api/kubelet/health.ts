import { defineEndpoint } from '../common'

export enum ServerMode {
  LEADER = 'leader',
  FOLLOWER = 'follower',
}

export enum ServerStatus {
  OK = 'ok',
}

type CubeHealthResponse = {
  status: ServerStatus
  mode: ServerMode
}

export const CubeletApiHealthEndpoint = defineEndpoint({
  method: 'GET',
  url: '/api/health',
  requestBody: undefined,
  responseBody: {} as CubeHealthResponse,
  errors: ['NOT_READY'] as const,
})
