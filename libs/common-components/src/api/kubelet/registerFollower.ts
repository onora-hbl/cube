import { defineEndpoint } from '../common'

interface CubeRegisterFollowerRequest {
  port: number
  name: string
}

const CubeRegisterFollowerSchema = {
  body: {
    type: 'object',
    properties: {
      port: { type: 'number' },
      name: { type: 'string' },
    },
    required: ['port', 'name'],
    additionalProperties: false,
  },
} as const

export const CubeletApiRegisterFollowerEndpoint = defineEndpoint({
  method: 'POST',
  url: '/api/register-follower',
  requestBody: {} as CubeRegisterFollowerRequest,
  responseBody: undefined,
  errors: [
    'HEALTH_CHECK_FAILED',
    'SERVER_NOT_HEALTHY',
    'SERVER_NOT_IN_FOLLOWER_MODE',
    'NODE_ALREADY_REGISTERED',
  ] as const,
  schema: CubeRegisterFollowerSchema,
})
