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
