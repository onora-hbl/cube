import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { EventEmitter } from 'stream'
import fp from 'fastify-plugin'
import { ResourceDefinition, ResourceType } from 'common-components'
import logger from '../logger'
import { PodStatus } from 'common-components/src/manifest/pod'
import { ContainerStatus } from 'common-components/src/manifest/container'

const childLogger = logger.child({ plugin: 'resources' })

type ResourceEvent = {
  uuid: string
  resourceUuid: string
  type: string
  reason?: string
  message?: string
  timestamp: Date
}

type ResourceEventRecord = {
  uuid: string
  resourceUuid: string
  eventType: string
  reason?: string
  message?: string
  timestamp: string
}

type ResourceMetadata = {
  name: string
  labels: Record<string, string>
  resourceVersion: number
  generation: number
  creationTime: Date
}

export type Resource = {
  uuid: string
  nodeUuid?: string
  resourceType: ResourceType
  spec: ResourceDefinition['spec']
  status: ResourceDefinition['status']
  reason?: string
  message?: string
  metadata: ResourceMetadata
  events: ResourceEvent[]
}

type ResourceRecord = {
  uuid: string
  nodeUuid?: string
  resourceType: string
  name: string
  labelsJson: string
  specJson: string
  resourceVersion: number
  generation: number
  creationTimestamp: string
  status: string
  reason?: string
  message?: string
}

class ResourceStore {
  private emitter = new EventEmitter()
  private fastify: FastifyInstance

  private resources: Map<string, Resource> = new Map()

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  public async loadAll() {
    const eventsRows = this.fastify.db
      .prepare(
        `SELECT uuid, resource_uuid as resourceUuid, event_type as eventType, reason, message, timestamp FROM resources_events;`,
      )
      .all() as ResourceEventRecord[]
    childLogger.debug(`Loading ${eventsRows.length} resource events from database`)
    const eventsByResourceUuid: Map<string, ResourceEvent[]> = new Map()
    for (const row of eventsRows) {
      const event: ResourceEvent = {
        uuid: row.uuid,
        resourceUuid: row.resourceUuid,
        type: row.eventType,
        reason: row.reason,
        message: row.message,
        timestamp: new Date(row.timestamp),
      }
      if (!eventsByResourceUuid.has(row.resourceUuid)) {
        eventsByResourceUuid.set(row.resourceUuid, [])
      }
      eventsByResourceUuid.get(row.resourceUuid)!.push(event)
    }
    const resourceRows = this.fastify.db
      .prepare(
        `SELECT uuid, node_uuid as nodeUuid, resource_type as resourceType, name, labels_json as labelsJson, spec_json as specJson, resource_version as resourceVersion, generation, creation_timestamp as creationTimestamp, status, reason, message FROM resources;`,
      )
      .all() as ResourceRecord[]
    childLogger.debug(`Loading ${resourceRows.length} resources from database`)
    for (const row of resourceRows) {
      const events = (eventsByResourceUuid.get(row.uuid) || []).sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      )
      const resource: Resource = {
        uuid: row.uuid,
        nodeUuid: row.nodeUuid || undefined,
        resourceType: row.resourceType as ResourceType,
        spec: JSON.parse(row.specJson),
        status: row.status as unknown as ResourceDefinition['status'],
        reason: row.reason || undefined,
        message: row.message || undefined,
        metadata: {
          name: row.name,
          labels: JSON.parse(row.labelsJson),
          resourceVersion: row.resourceVersion,
          generation: row.generation,
          creationTime: new Date(row.creationTimestamp),
        },
        events,
      }
      this.resources.set(row.name, resource)
    }
  }

  public async registerNewResource(resource: ResourceDefinition, uuid: string, name: string) {
    const now = new Date()
    const status =
      resource.type === 'pod'
        ? PodStatus.PENDING
        : resource.type === 'container'
          ? ContainerStatus.SCHEDULING
          : 'UNDEFINED'
    this.fastify.db
      .prepare(
        `INSERT INTO resources (uuid, resource_type, name, labels_json, spec_json, resource_version, generation, status, creation_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      )
      .run(
        uuid,
        resource.type,
        name,
        JSON.stringify(resource.metadata?.labels || {}),
        JSON.stringify(resource.spec),
        1,
        1,
        status,
        now.toISOString(),
      )
    const eventUuid = crypto.randomUUID()
    this.fastify.db
      .prepare(
        `INSERT INTO resources_events (uuid, resource_uuid, event_type, reason, message, timestamp) VALUES (?, ?, ?, ?, ?, ?);`,
      )
      .run(
        eventUuid,
        uuid,
        'RESOURCE_CREATED',
        'Resource created',
        `Resource of type ${resource.type} named ${name} has been created.`,
        now.toISOString(),
      )
    const newResource: Resource = {
      uuid,
      resourceType: resource.type,
      spec: resource.spec,
      status: status as unknown as ResourceDefinition['status'],
      metadata: {
        name,
        labels: resource.metadata?.labels || {},
        resourceVersion: 1,
        generation: 1,
        creationTime: now,
      },
      events: [
        {
          uuid: eventUuid,
          resourceUuid: uuid,
          type: 'RESOURCE_CREATED',
          reason: 'Resource created',
          message: `Resource of type ${resource.type} named ${name} has been created.`,
          timestamp: now,
        },
      ],
    }
    this.resources.set(name, newResource)
    this.emitter.emit('add', newResource)
  }

  public getAll(): Resource[] {
    return Array.from(this.resources.values())
  }

  public on(event: 'add', listener: (resource: Resource) => void) {
    this.emitter.on(event, listener)
  }

  public [Symbol.dispose]() {
    this.emitter.removeAllListeners()
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    resourceStore: ResourceStore
  }
}

const resourcesPlugin: FastifyPluginAsync = async (fastify) => {
  const resourceStore = new ResourceStore(fastify)
  fastify.decorate('resourceStore', resourceStore)

  fastify.addHook('onClose', async () => {
    resourceStore[Symbol.dispose]()
  })

  await resourceStore.loadAll()
}

export default fp(resourcesPlugin)
