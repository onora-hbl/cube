import { JSONSchemaType } from 'ajv'

export const ContainerType = 'container' as const

export type ContainerSpec = {
  name: string
  image: string
  env?: Record<string, string>
}

export const _ContainerSpecSchema: JSONSchemaType<ContainerSpec> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    image: { type: 'string' },
    env: {
      type: 'object',
      additionalProperties: { type: 'string' },
      nullable: true,
      required: [],
    },
  },
  required: ['name', 'image'],
  additionalProperties: false,
}

export const ContainerSpecSchema = _ContainerSpecSchema as any

export const ContainerResource = {
  type: ContainerType,
  specType: {} as ContainerSpec,
  specSchema: ContainerSpecSchema,
}
