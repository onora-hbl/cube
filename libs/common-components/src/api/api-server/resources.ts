import {
  allResources,
  ResourceDefinition,
  ResourceMetadataDefinition,
  ResourceSchema,
  ResourceType,
} from '../../manifest/common'
import { defineEndpoint } from '../common'

interface ApiServerApplyRequest {
  resource: Omit<ResourceDefinition, 'metadata' | 'status'> & {
    metadata?: Partial<ResourceMetadataDefinition>
  }
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
  errors: ['RESOURCE_VERSION_CONFLICT'] as const,
  schema: ApiServerApplySchema,
})

interface ApiServerListResponse {
  resourcesOverview: Record<string, string>[]
}

export const ApiServerApiListEndpoint = defineEndpoint({
  method: 'GET',
  url: '/api/resources/:type/list',
  urlParams: {
    type: {
      type: 'string',
      validator: (value: string) => allResources.map((r) => r.type).includes(value),
    },
  },
  requestBody: undefined,
  responseBody: {} as ApiServerListResponse,
  errors: [] as const,
})

interface ApiServerGetResponse {
  resource: ResourceDefinition
  eventsOverview: Record<string, string>[]
}

export const ApiServerApiGetEndpoint = defineEndpoint({
  method: 'GET',
  url: '/api/resources/:type/:name',
  urlParams: {
    type: {
      type: 'string',
      validator: (value: string) => allResources.map((r) => r.type).includes(value),
    },
    name: { type: 'string' },
  },
  requestBody: undefined,
  responseBody: {} as ApiServerGetResponse,
  errors: ['RESOURCE_NOT_FOUND'] as const,
})
