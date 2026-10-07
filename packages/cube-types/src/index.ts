import type { JSONSchemaType, SchemaObject } from 'ajv'

export type ResourceKind = 'node' | 'pod'

export const RESOURCE_KINDS = ['node', 'pod']

export type ResourceMetadatas = {
  id: string
  name: string
  labels?: Record<string, string>
  creationTimestamp: number
  deletionTimestamp?: number
  resourceVersion: number
  finalizers: string[]
  generation: number
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
    resourceVersion: { type: 'number' },
    finalizers: {
      type: 'array',
      items: { type: 'string' },
    },
    generation: { type: 'number' },
  },
  required: ['id', 'name', 'creationTimestamp', 'resourceVersion', 'finalizers', 'generation'],
  additionalProperties: false,
}

export type NodeSpec = {
  address: string
  port: number
}

export const NodeSpecSchema: JSONSchemaType<NodeSpec> = {
  type: 'object',
  properties: {
    address: { type: 'string' },
    port: { type: 'number' },
  },
  required: ['address', 'port'],
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

export const NodeDefinitionSchema: JSONSchemaType<ResourceDefinition<'node'>> = {
  type: 'object',
  properties: {
    kind: { type: 'string', const: 'node' },
    metadatas: ResourceMetadatasSchema,
    status: NodeStatusSchema,
    spec: NodeSpecSchema,
  },
  required: ['kind', 'metadatas', 'status', 'spec'],
  additionalProperties: false,
}

export const PodDefinitionSchema: JSONSchemaType<ResourceDefinition<'pod'>> = {
  type: 'object',
  properties: {
    kind: { type: 'string', const: 'pod' },
    metadatas: ResourceMetadatasSchema,
    status: PodeStatusSchema,
    spec: PodSpecSchema,
  },
  required: ['kind', 'metadatas', 'status', 'spec'],
  additionalProperties: false,
}

export const DEFINITION_SCHEMAS: Record<ResourceKind, SchemaObject> = {
  node: NodeDefinitionSchema,
  pod: PodDefinitionSchema,
}

export type AnyResourceDefinition = {
  [K in ResourceKind]: ResourceDefinition<K>
}[ResourceKind]

export const ResourceDefinitionSchema: JSONSchemaType<AnyResourceDefinition> = {
  oneOf: [NodeDefinitionSchema, PodDefinitionSchema],
}

export type CreateResourceMetadatas = {
  name: string
  labels?: Record<string, string>
  finalizers?: string[]
}

export const CreateResourceMetadatasSchema: JSONSchemaType<CreateResourceMetadatas> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    labels: {
      type: 'object',
      additionalProperties: { type: 'string' },
      nullable: true,
      required: [],
    },
    finalizers: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
    },
  },
  required: ['name'],
  additionalProperties: false,
}

export type CreateResourceDefinition<K extends ResourceKind> = {
  kind: K
  metadatas: CreateResourceMetadatas
  spec: ResourceSpec<K>
}

export const CreateNodeDefinitionSchema: JSONSchemaType<CreateResourceDefinition<'node'>> = {
  type: 'object',
  properties: {
    kind: { type: 'string', const: 'node' },
    metadatas: CreateResourceMetadatasSchema,
    spec: NodeSpecSchema,
  },
  required: ['kind', 'metadatas', 'spec'],
  additionalProperties: false,
}

export const CreatePodDefinitionSchema: JSONSchemaType<CreateResourceDefinition<'pod'>> = {
  type: 'object',
  properties: {
    kind: { type: 'string', const: 'pod' },
    metadatas: CreateResourceMetadatasSchema,
    spec: PodSpecSchema,
  },
  required: ['kind', 'metadatas', 'spec'],
  additionalProperties: false,
}

export type CreateAnyResourceDefinition = {
  [K in ResourceKind]: CreateResourceDefinition<K>
}[ResourceKind]

export const CreateResourceDefinitionSchema: JSONSchemaType<CreateAnyResourceDefinition> = {
  oneOf: [CreateNodeDefinitionSchema, CreatePodDefinitionSchema],
}

export enum CubeRole {
  CLI = 'cube cli',
  CUBELET = 'cubelet',
  API_SERVER = 'api server',
}
