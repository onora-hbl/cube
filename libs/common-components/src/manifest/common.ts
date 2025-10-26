import { PodResourceDefinition, PodSpecSchema } from './pod'

export type ResourceStatus<S extends string> = {
  state: S
  reason?: string
  message?: string
}

export type ResourceMetadataDefinition = {
  name: string
  labels: Record<string, string>
  resourceVersion: number
  generation: number
  creationTimestamp: string
}

export type ResourceDefinition = PodResourceDefinition

export type ResourceType = ResourceDefinition['type']

export const allResources = [
  {
    type: 'pod',
    specSchema: PodSpecSchema,
  },
]

const MetadataSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    labels: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    resourceVersion: { type: 'number' },
    generation: { type: 'number' },
    creationTimestamp: { type: 'string' },
  },
  required: [],
  additionalProperties: false,
}

export const ResourceSchema = {
  oneOf: allResources.map((r) => ({
    type: 'object',
    properties: {
      metadata: MetadataSchema,
      type: { const: r.type },
      spec: r.specSchema,
    },
    required: ['type', 'spec'],
    additionalProperties: false,
  })),
}
