import { ResourceDefinition } from 'common-components'
import logger from '../logger'
import { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export type Resource = ResourceDefinition & {
  scheduledOn?: string
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

declare module 'fastify' {
  interface FastifyInstance {
    resources: Resource[]
    createResource: (resource: Resource) => void
  }
}

function generateShortIdentifier() {
  return Math.random().toString(36).substring(2, 8)
}

function resourceRecordToResource(record: ResourceRecord): Resource {
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
  }
}

function createResource(resource: Resource, fastify: FastifyInstance) {
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
  return resourceRecordToResource({ id: info.lastInsertRowid as number, ...resourceRecord })
}

const childLogger = logger.child({ plugin: 'resourcesPlugin' })

const resourcesPlugin = async (fastify: FastifyInstance) => {
  const resourceRecords = fastify.db.prepare('SELECT * FROM resource').all() as ResourceRecord[]
  const resources: Resource[] = resourceRecords.map((record) => resourceRecordToResource(record))
  childLogger.info(`Loaded ${resources.length} resources from the database`)
  fastify.decorate('resources', resources)

  fastify.decorate('createResource', (resource: Resource) => createResource(resource, fastify))
}

export default fp(resourcesPlugin)
