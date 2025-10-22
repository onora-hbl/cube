import { ResourceDefinition, ResourceSchema } from '../../manifest/common'
import { defineEndpoint } from '../common'

interface CubeApplyRequest {
  resource: ResourceDefinition
}

const CubeApplyRequestSchema = {
  body: {
    type: 'object',
    properties: {
      resource: ResourceSchema,
    },
    required: ['resource'],
    additionalProperties: false,
  },
} as const

interface CubeApplyResponse {
  resource: ResourceDefinition
}

export const CubeletApiApplyEndpoint = defineEndpoint({
  method: 'POST',
  url: '/api/apply',
  requestBody: {} as CubeApplyRequest,
  responseBody: {} as CubeApplyResponse,
  errors: [] as const,
  schema: CubeApplyRequestSchema,
})
