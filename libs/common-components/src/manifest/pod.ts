import { JSONSchemaType } from 'ajv'
import { _ContainerSpecSchema, ContainerSpec } from './container'

export const PodType = 'pod' as const

export type PodSpec = {
  containers: {
    spec: ContainerSpec
  }[]
}

export const _PodSpecSchema: JSONSchemaType<PodSpec> = {
  type: 'object',
  properties: {
    containers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          spec: _ContainerSpecSchema,
        },
        required: ['spec'],
        additionalProperties: false,
      },
    },
  },
  required: ['containers'],
  additionalProperties: false,
}

export const PodSpecSchema = _PodSpecSchema as any

export const PodResource = {
  type: PodType,
  specType: {} as PodSpec,
  specSchema: PodSpecSchema,
}
