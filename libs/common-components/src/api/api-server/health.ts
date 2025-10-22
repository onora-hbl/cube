import { defineEndpoint } from '../common'

export enum CubeApiServerStatus {
  OK = 'ok',
}

type ApiServerHealthResponse = {
  status: CubeApiServerStatus
}

export const ApiServerApiHealthEndpoint = defineEndpoint({
  method: 'GET',
  url: '/api/health',
  requestBody: undefined,
  responseBody: {} as ApiServerHealthResponse,
  errors: ['NOT_READY'] as const,
})
