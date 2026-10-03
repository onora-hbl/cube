import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import Database from 'better-sqlite3'
import {
  PodePhase,
  type ResourceKind,
  type ResourceMetadatas,
  type ResourceSpec,
  type ResourceStatus,
  type ResourceStatusMap,
} from 'cube-types'
import { v4 as uuid } from 'uuid'

class ResourceAlreadyExistsError extends Error {
  constructor(kind: string, name: string) {
    super(`Resource of kind "${kind}" with name "${name}" already exists.`)
  }
}

const DEFAULT_STATUS: ResourceStatusMap = {
  node: {},
  pod: { phase: PodePhase.PENDING },
}

class ResourcesStore {
  private existsStmt
  private insertStmt

  constructor(private db: Database.Database) {
    this.existsStmt = this.db.prepare<[string, string], { found: 0 | 1 }>(
      'SELECT EXISTS(SELECT 1 FROM resources WHERE kind = ? AND name = ?) AS found',
    )
    this.insertStmt = this.db.prepare<[string, string, string, string, string, string], void>(
      'INSERT INTO resources (id, kind, name, metadatas, spec, status) VALUES (?, ?, ?, ?, ?, ?)',
    )
  }

  private resourceExists(kind: string, name: string): boolean {
    return this.existsStmt.get(kind, name)!.found === 1
  }

  private insertResource(id: string, kind: string, name: string, metadatas: string, spec: string, status: string) {
    this.insertStmt.run(id, kind, name, metadatas, spec, status)
  }

  private getDefaultStatus<K extends ResourceKind>(kind: K): ResourceStatus<K> {
    return DEFAULT_STATUS[kind]
  }

  public async createResource<K extends ResourceKind>(params: {
    kind: K
    metadatas: { name: string; labels?: Record<string, string> }
    spec: ResourceSpec<K>
  }) {
    if (this.resourceExists(params.kind, params.metadatas.name)) {
      throw new ResourceAlreadyExistsError(params.kind, params.metadatas.name)
    }

    const id = uuid()
    const metadatas: ResourceMetadatas = {
      id,
      ...params.metadatas,
      creationTimestamp: new Date().getTime(),
    }
    const status = this.getDefaultStatus(params.kind)

    this.insertResource(
      id,
      params.kind,
      metadatas.name,
      JSON.stringify(metadatas),
      JSON.stringify(params.spec),
      JSON.stringify(status),
    )
  }

  public [Symbol.dispose]() {}
}

declare module 'fastify' {
  interface FastifyInstance {
    resourcesStore: ResourcesStore
  }
}

const resourcesStorePlugin: FastifyPluginAsync = async (fastify) => {
  const resourcesStore = new ResourcesStore(fastify.db)

  fastify.decorate('resourcesStore', resourcesStore)

  fastify.addHook('onClose', (_instance, done) => {
    resourcesStore[Symbol.dispose]()
    done()
  })
}

export default fp(resourcesStorePlugin)
