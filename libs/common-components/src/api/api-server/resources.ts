import { ResourceDefinition, ResourceSchema, ResourceType } from '../../manifest/common'
import { defineEndpoint } from '../common'

interface ApiServerApplyRequest {
  resource: ResourceDefinition
}

const ApiServerApplySchema = {
  body: {
    type: 'object',
    properties: {
      resource: ResourceSchema,
    },
    required: ['resource'],
    additionalProperties: false,
  },
} as const

export enum ApplyAction {
  CREATE = 'create',
  UPDATE = 'update',
}

interface ApiServerApplyResponse {
  action: ApplyAction
  resourceType: ResourceType
  resourceName: string
}

export const ApiServerApiApplyEndpoint = defineEndpoint({
  method: 'POST',
  url: '/api/resources/apply',
  requestBody: {} as ApiServerApplyRequest,
  responseBody: {} as ApiServerApplyResponse,
  errors: ['IMMUTABLE_SPEC', 'RESOURCE_VERSION_CONFLICT'] as const,
  schema: ApiServerApplySchema,
})
