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

  private getSchedulingStatusForResourceType(
    resourceType: ResourceType,
  ): ResourceDefinition['status'] {
    switch (resourceType) {
      case 'pod':
        return PodStatus.SCHEDULING as unknown as ResourceDefinition['status']
      case 'container':
        return ContainerStatus.SCHEDULING as unknown as ResourceDefinition['status']
    }
  }

  private getScheduledStatusForResourceType(
    resourceType: ResourceType,
  ): ResourceDefinition['status'] {
    switch (resourceType) {
      case 'pod':
        return PodStatus.STARTING as unknown as ResourceDefinition['status']
      case 'container':
        return ContainerStatus.PULLING as unknown as ResourceDefinition['status']
    }
  }

  public async registerNewResource(resource: ResourceDefinition, uuid: string, name: string) {
    const now = new Date()
    const status = this.getSchedulingStatusForResourceType(resource.type)
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
      status,
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

  public addEventToResource(
    resourceUuid: string,
    event: Omit<ResourceEvent, 'uuid' | 'timestamp'>,
  ): ResourceEvent {
    const resource = this.getAll().find((res) => res.uuid === resourceUuid)
    if (!resource) {
      throw new Error(`Resource with uuid ${resourceUuid} not found`)
    }
    const eventUuid = crypto.randomUUID()
    const now = new Date()
    this.fastify.db
      .prepare(
        `INSERT INTO resources_events (uuid, resource_uuid, event_type, reason, message, timestamp) VALUES (?, ?, ?, ?, ?, ?);`,
      )
      .run(eventUuid, resourceUuid, event.type, event.reason, event.message, now.toISOString())
    const newEvent: ResourceEvent = {
      uuid: eventUuid,
      resourceUuid,
      type: event.type,
      reason: event.reason,
      message: event.message,
      timestamp: now,
    }
    resource.events.push(newEvent)
    this.emitter.emit('update', resource)
    return newEvent
  }

  public updateResourceNode(resourceUuid: string, nodeUuid: string | undefined) {
    const resource = this.getAll().find((res) => res.uuid === resourceUuid)
    if (!resource) {
      throw new Error(`Resource with uuid ${resourceUuid} not found`)
    }
    const node =
      nodeUuid != null
        ? this.fastify.nodeStore.getAll().find((n) => n.uuid === nodeUuid)
        : undefined
    if (!node && nodeUuid != null) {
      throw new Error(`Node with uuid ${nodeUuid} not found`)
    }
    const status =
      nodeUuid != null
        ? this.getScheduledStatusForResourceType(resource.resourceType)
        : this.getSchedulingStatusForResourceType(resource.resourceType)
    this.fastify.db
      .prepare(`UPDATE resources SET node_uuid = ?, status = ? WHERE uuid = ?;`)
      .run(nodeUuid, status, resource.uuid)
    this.addEventToResource(resource.uuid, {
      resourceUuid: resource.uuid,
      type: nodeUuid != null ? 'RESOURCE_SCHEDULED' : 'RESOURCE_UNSCHEDULED',
      reason: nodeUuid != null ? 'Resource scheduled' : 'Resource unscheduled',
      message:
        nodeUuid != null
          ? `Resource ${resource.metadata.name} has been scheduled to node ${node?.name}.`
          : `Resource ${resource.metadata.name} has been unscheduled from its node.`,
    })
    resource.status = status
    resource.nodeUuid = nodeUuid
    this.emitter.emit('update', resource)
  }

  public getAll(): Resource[] {
    return Array.from(this.resources.values())
  }

  public createDefinitionFromResource(resource: Resource): ResourceDefinition {
    return {
      type: resource.resourceType,
      spec: resource.spec,
      metadata: {
        name: resource.metadata.name,
        labels: resource.metadata.labels,
        resourceVersion: resource.metadata.resourceVersion,
        generation: resource.metadata.generation,
        creationTimestamp: resource.metadata.creationTime.toISOString(),
      },
      status: resource.status,
    } as ResourceDefinition
  }

  public on(event: 'add' | 'update', listener: (resource: Resource) => void) {
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
