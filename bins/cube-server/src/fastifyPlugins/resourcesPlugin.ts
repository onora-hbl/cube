import { ResourceDefinition } from 'common-components'
import logger from '../logger'
import { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export type ResourceEvent = {
  type: ResourceEventType
  happenedAt: Date
  details: string
}

export type Resource = ResourceDefinition & {
  scheduledOn?: string
  events: ResourceEvent[]
}

type ResourceRecord = {
  id: number
  name: string
  type: string
  labels?: string
  scheduled_on?: string
  resource_version: number
  generation: number
  spec: string
}

export enum ResourceEventType {
  CREATED = 'created',
  SCHEDULED = 'scheduled',
  STARTED = 'started',
  READY = 'ready',
  FAILED = 'failed',
  TERMINATED = 'terminated',
  DELETED = 'deleted',
}

type ResourceEventRecord = {
  id: number
  resource_id: number
  event_type: ResourceEventType
  details: string
  happened_at: string
}

declare module 'fastify' {
  interface FastifyInstance {
    resources: Resource[]
    createResource: (resource: Omit<Resource, 'events'>) => void
    scheduleResource: (resourceName: string, nodeName: string) => void
  }
}

function generateShortIdentifier() {
  return Math.random().toString(36).substring(2, 8)
}

function resourceEventRecordToResourceEvent(record: ResourceEventRecord): ResourceEvent {
  return {
    type: record.event_type,
    happenedAt: record.happened_at ? new Date(record.happened_at) : new Date(),
    details: record.details,
  }
}

function resourceRecordToResource(record: ResourceRecord, events: ResourceEventRecord[]): Resource {
  return {
    type: record.type as ResourceDefinition['type'],
    metadata: {
      name: record.name,
      labels: record.labels ? JSON.parse(record.labels) : {},
      resourceVersion: record.resource_version,
      generation: record.generation,
    },
    spec: JSON.parse(record.spec),
    scheduledOn: record.scheduled_on || undefined,
    events: events.map(resourceEventRecordToResourceEvent),
  }
}

function createResource(resource: Omit<Resource, 'events'>, fastify: FastifyInstance) {
  const resourceRecord = {
    name: resource.metadata?.name ?? `${resource.type}-${generateShortIdentifier()}`,
    type: resource.type,
    labels: resource.metadata?.labels
      ? JSON.stringify(resource.metadata.labels)
      : JSON.stringify({}),
    resource_version: resource.metadata?.resourceVersion ?? 1,
    generation: resource.metadata?.generation ?? 1,
    spec: JSON.stringify(resource.spec),
  }
  const stmt = fastify.db.prepare(
    `INSERT INTO resource (name, type, labels, resource_version, generation, spec) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const info = stmt.run(
    resourceRecord.name,
    resourceRecord.type,
    resourceRecord.labels,
    resourceRecord.resource_version,
    resourceRecord.generation,
    resourceRecord.spec,
  )
  const resourceEventRecord = {
    resource_id: info.lastInsertRowid as number,
    happened_at: new Date().toISOString(),
    event_type: ResourceEventType.CREATED,
    details: 'Resource created',
  }
  const resourceInfo = fastify.db
    .prepare(
      `INSERT INTO resource_event (resource_id, happened_at, event_type, details) VALUES (?, ?, ?, ?)`,
    )
    .run(
      resourceEventRecord.resource_id,
      resourceEventRecord.happened_at,
      resourceEventRecord.event_type,
      resourceEventRecord.details,
    )
  return resourceRecordToResource({ id: info.lastInsertRowid as number, ...resourceRecord }, [
    { id: resourceInfo.lastInsertRowid as number, ...resourceEventRecord },
  ])
}

async function scheduleResource(fastify: FastifyInstance, resourceName: string, nodeName: string) {
  const resource = fastify.resources.find((r) => r.metadata?.name === resourceName)
  if (!resource) {
    throw new Error(`Resource ${resourceName} not found`)
  }
  const resourceRecord = fastify.db
    .prepare('SELECT id FROM resource WHERE name = ?')
    .get(resourceName) as ResourceRecord | undefined
  if (!resourceRecord) {
    throw new Error(`Resource record for ${resourceName} not found in database`)
  }
  fastify.db
    .prepare('UPDATE resource SET scheduled_on = ? WHERE id = ?')
    .run(nodeName, resourceRecord.id)
  resource.scheduledOn = nodeName
  const resourceEventRecord = {
    resource_id: resourceRecord.id,
    happened_at: new Date().toISOString(),
    event_type: ResourceEventType.SCHEDULED,
    details: `Resource scheduled on node ${nodeName}`,
  }
  const eventInfo = fastify.db
    .prepare(
      `INSERT INTO resource_event (resource_id, happened_at, event_type, details) VALUES (?, ?, ?, ?)`,
    )
    .run(
      resourceEventRecord.resource_id,
      resourceEventRecord.happened_at,
      resourceEventRecord.event_type,
      resourceEventRecord.details,
    )
  resource.events.push(
    resourceEventRecordToResourceEvent({
      id: eventInfo.lastInsertRowid as number,
      ...resourceEventRecord,
    }),
  )
  fastify.db
}

const childLogger = logger.child({ plugin: 'resourcesPlugin' })

const resourcesPlugin = async (fastify: FastifyInstance) => {
  const resourceRecords = fastify.db.prepare('SELECT * FROM resource').all() as ResourceRecord[]
  const resourceEventRecords = fastify.db
    .prepare('SELECT * FROM resource_event')
    .all() as ResourceEventRecord[]
  const resourceEventsByResourceId: Record<number, ResourceEventRecord[]> = {}
  for (const eventRecord of resourceEventRecords) {
    if (!resourceEventsByResourceId[eventRecord.resource_id]) {
      resourceEventsByResourceId[eventRecord.resource_id] = []
    }
    resourceEventsByResourceId[eventRecord.resource_id].push(eventRecord)
  }
  const resources: Resource[] = resourceRecords.map((record) =>
    resourceRecordToResource(record, resourceEventsByResourceId[record.id] || []),
  )
  childLogger.info(`Loaded ${resources.length} resources from the database`)
  childLogger.debug('Resources: %o', resources)
  fastify.decorate('resources', resources)

  fastify.decorate('createResource', (resource: Omit<Resource, 'events'>) =>
    createResource(resource, fastify),
  )

  fastify.decorate('scheduleResource', (resourceName: string, nodeName: string) =>
    scheduleResource(fastify, resourceName, nodeName),
  )
}

export default fp(resourcesPlugin)
