import { JSONSchemaType } from 'ajv'

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

export enum ContainerState {
  NOT_CREATED = 'not_created',
  PULLING = 'pulling',
  PULLING_ERROR = 'pulling_error',
  PULLING_ERROR_LOOP = 'pulling_error_loop',
  CREATING = 'creating',
  STARTING = 'starting',
  CRASH = 'crash',
  CRASH_LOOP = 'crash_loop',
  RUNNING = 'running',
  FAILED = 'failed',
  SUCCEEDED = 'succeeded',
  DELETING = 'deleting',
}
