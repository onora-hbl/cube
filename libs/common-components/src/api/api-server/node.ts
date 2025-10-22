import { defineEndpoint } from '../common'

interface ApiServerRegisterNodeRequest {
  name: string
  cpuCores: number
  memoryMb: number
}

const ApiServerRegisterNodeSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      cpuCores: { type: 'number' },
      memoryMb: { type: 'number' },
    },
    required: ['name', 'cpuCores', 'memoryMb'],
    additionalProperties: false,
  },
} as const

export const ApiServerApiRegisterNodeEndpoint = defineEndpoint({
  method: 'POST',
  url: '/api/node',
  requestBody: {} as ApiServerRegisterNodeRequest,
  responseBody: undefined,
  errors: ['NODE_ALREADY_REGISTERED'] as const,
  schema: ApiServerRegisterNodeSchema,
})

interface ApiServerHearthbeatRequest {
  name: string
  cpuUsagePercent: number
  memoryUsageMb: number
}

const ApiServerHearthbeatSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      cpuUsagePercent: { type: 'number' },
      memoryUsageMb: { type: 'number' },
    },
    required: ['name', 'cpuUsagePercent', 'memoryUsageMb'],
    additionalProperties: false,
  },
} as const

export const ApiServerApiHeartbeatEndpoint = defineEndpoint({
  method: 'POST',
  url: '/api/node/heartbeat',
  requestBody: {} as ApiServerHearthbeatRequest,
  responseBody: undefined,
  errors: ['NODE_NOT_REGISTERED'] as const,
  schema: ApiServerHearthbeatSchema,
})
