import { JSONSchemaType } from 'ajv'
import { _ContainerSpecSchema, ContainerSpec, ContainerState } from './container'
import { ResourceMetadataDefinition, ResourceStatus } from './common'

export type PodType = 'pod'

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

export enum PodState {
  SCHEDULING = 'scheduling',
  CREATING = 'creating',
  STARTING = 'starting',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

export enum PodEventType {
  REGISTERED = 'registered',
  SCHEDULED = 'scheduled',
  UNSCHEDULED = 'unscheduled',
  CREATED = 'created',
  RUNNING = 'running',
  PULLING_ERROR = 'pulling_error',
  CRASHED = 'crashed',
  CRASH_LOOP = 'crash_loop',
  DELETED = 'deleted',
}

export type PodStatus = ResourceStatus<PodState> & {
  containerStatuses: Record<string, ResourceStatus<ContainerState>>
}

export type PodResourceDefinition = {
  type: PodType
  metadata: ResourceMetadataDefinition
  spec: PodSpec
  status: PodStatus
}
