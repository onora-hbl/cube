import { ContainerResource } from './container'
import { PodResource } from './pod'

type ResourceMetadataDefinition = Partial<{
  name: string
  labels: Record<string, string>
  resourceVersion: number
  generation: number
  creationTimestamp: string
}>

const BaseMetadataSchema = {
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

export const allResources = [ContainerResource, PodResource] as const

export type ResourceDefinition =
  | {
      type: typeof ContainerResource.type
      metadata?: ResourceMetadataDefinition
      spec: typeof ContainerResource.specType
    }
  | {
      type: typeof PodResource.type
      metadata?: ResourceMetadataDefinition
      spec: typeof PodResource.specType
    }

export const ResourceSchema = {
  oneOf: allResources.map((r) => ({
    type: 'object',
    properties: {
      metadata: BaseMetadataSchema,
      type: { const: r.type },
      spec: r.specSchema,
    },
    required: ['type', 'spec'],
    additionalProperties: false,
  })),
}
