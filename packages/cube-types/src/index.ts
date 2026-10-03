import type { JSONSchemaType } from 'ajv'

export type ResourceKind = 'node' | 'pod'

export type ResourceMetadatas = {
  id: string
  name: string
  labels?: Record<string, string>
  creationTimestamp: number
  deletionTimestamp?: number
}

export const ResourceMetadatasSchema: JSONSchemaType<ResourceMetadatas> = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    labels: {
      type: 'object',
      additionalProperties: { type: 'string' },
      nullable: true,
      required: [],
    },
    creationTimestamp: { type: 'number' },
    deletionTimestamp: { type: 'number', nullable: true },
  },
  required: ['id', 'name', 'creationTimestamp'],
  additionalProperties: false,
}

export type NodeSpec = {
  name: string
}

export const NodeSpecSchema: JSONSchemaType<NodeSpec> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
  },
  required: ['name'],
  additionalProperties: false,
}

export type NodeStatus = {
  lastHeartbeatTimestamp?: number
}

export const NodeStatusSchema: JSONSchemaType<NodeStatus> = {
  type: 'object',
  properties: {
    lastHeartbeatTimestamp: { type: 'number', nullable: true },
  },
  required: [],
  additionalProperties: false,
}

export type ContainerSpec = {
  name: string
  image: string
  env?: Record<string, string>
}

export const ContainerSpecSchema: JSONSchemaType<ContainerSpec> = {
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

export type PodSpec = {
  containers: {
    spec: ContainerSpec
  }[]
}

export const PodSpecSchema: JSONSchemaType<PodSpec> = {
  type: 'object',
  properties: {
    containers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          spec: ContainerSpecSchema,
        },
        required: ['spec'],
        additionalProperties: false,
      },
    },
  },
  required: ['containers'],
  additionalProperties: false,
}

export enum PodePhase {
  PENDING = 'Pending',
  RUNNING = 'Running',
  SUCCEEDED = 'Succeeded',
  FAILED = 'Failed',
}

export type PodStatus = {
  phase: PodePhase
}

export const PodeStatusSchema: JSONSchemaType<PodStatus> = {
  type: 'object',
  properties: {
    phase: {
      type: 'string',
      enum: Object.values(PodePhase),
    },
  },
  required: ['phase'],
  additionalProperties: false,
}

export type ResourceSpecMap = {
  node: NodeSpec
  pod: PodSpec
}

export type ResourceSpec<K extends ResourceKind> = ResourceSpecMap[K]

export type ResourceStatusMap = {
  node: NodeStatus
  pod: PodStatus
}

export type ResourceStatus<K extends ResourceKind> = ResourceStatusMap[K]

export type ResourceDefinition<K extends ResourceKind> = {
  kind: K
  metadatas: ResourceMetadatas
  status: ResourceStatus<K>
  spec: ResourceSpec<K>
}

export enum CubeRole {
  CLI = 'cube cli',
  CUBELET = 'cubelet',
}
