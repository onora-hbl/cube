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
  CREATED = 'created',
  STARTING = 'starting',
  CRASH = 'crash',
  CRASH_LOOP = 'crash_loop',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  DELETING = 'deleting',
}

export enum ContainerEventType {
  IMAGE_ALREADY_PRESENT = 'image_already_present',
  IMAGE_PULL_STARTED = 'image_pull_started',
  IMAGE_PULL_SUCCEEDED = 'image_pull_succeeded',
  IMAGE_PULL_FAILED = 'image_pull_failed',
  CREATED = 'created',
  STARTED = 'started',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  DELETED = 'deleted',
}
