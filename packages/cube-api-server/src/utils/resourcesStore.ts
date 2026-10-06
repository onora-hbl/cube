import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import Database from 'better-sqlite3'
import {
  CubeRole,
  NodeSpecSchema,
  NodeStatusSchema,
  PodePhase,
  PodeStatusSchema,
  PodSpecSchema,
  ResourceMetadatasSchema,
  type CreateResourceMetadatas,
  type ResourceDefinition,
  type ResourceKind,
  type ResourceMetadatas,
  type ResourceSpec,
  type ResourceStatus,
  type ResourceStatusMap,
} from 'cube-types'
import { v4 as uuid } from 'uuid'
import type { WatchManager } from './watchManager.js'
import { Ajv, type ValidateFunction } from 'ajv'
import { assertPatchAllowed } from './patchPolicies.js'
import { applyMergePatch, type JsonObject } from './mergeUtils.js'
import { ForbiddenError, InvalidPatchError, ResourceAlreadyExistsError, ResourceNotFoundError } from './errors.js'

const FINAL_DELETION_INTERVAL_MS = 5_000

const DEFAULT_STATUS: ResourceStatusMap = {
  node: {},
  pod: { phase: PodePhase.PENDING },
}

const CREATE_RESOURCE_POLICY: Record<ResourceKind, CubeRole[]> = {
  node: [CubeRole.CUBELET],
  pod: [CubeRole.CLI],
}

const DELETE_RESOURCE_POLICY: Record<ResourceKind, CubeRole[]> = {
  node: [CubeRole.CUBELET],
  pod: [CubeRole.CLI],
}

const ajv = new Ajv()
const validateMetadatas = ajv.compile(ResourceMetadatasSchema)
const VALIDATORS: Record<ResourceKind, { spec: ValidateFunction; status: ValidateFunction }> = {
  node: { spec: ajv.compile(NodeSpecSchema), status: ajv.compile(NodeStatusSchema) },
  pod: { spec: ajv.compile(PodSpecSchema), status: ajv.compile(PodeStatusSchema) },
}

class ResourcesStore {
  private existsStmt
  private insertStmt
  private selectStmt
  private updateStmt
  private selectAllMetadatasStmt
  private deleteStmt
  private selectByIdStmt
  private finalDeletionTimeout

  constructor(
    private db: Database.Database,
    private watchManager: WatchManager,
  ) {
    this.existsStmt = this.db.prepare<[string, string], { found: 0 | 1 }>(
      'SELECT EXISTS(SELECT 1 FROM resources WHERE kind = ? AND name = ?) AS found',
    )
    this.insertStmt = this.db.prepare<[string, string, string, string, string, string], void>(
      'INSERT INTO resources (id, kind, name, metadatas, spec, status) VALUES (?, ?, ?, ?, ?, ?)',
    )
    this.selectStmt = this.db.prepare<
      [string, string],
      { metadatas: string; spec: string; status: string } | undefined
    >('SELECT metadatas, spec, status FROM resources WHERE kind = ? AND name = ?')
    this.updateStmt = this.db.prepare<[string, string, string, string, string], void>(
      'UPDATE resources SET metadatas = ?, spec = ?, status = ? WHERE kind = ? AND name = ?',
    )
    this.selectAllMetadatasStmt = this.db.prepare<[], { id: string; kind: ResourceKind; metadatas: string }>(
      'SELECT id, kind, metadatas FROM resources',
    )
    this.deleteStmt = this.db.prepare<[string], void>('DELETE FROM resources WHERE id = ?')
    this.selectByIdStmt = this.db.prepare<[string], { kind: string; name: string } | undefined>(
      'SELECT kind, name FROM resources WHERE id = ?',
    )

    this.finalDeletionTimeout = setInterval(() => this.finalDeletionTick(), FINAL_DELETION_INTERVAL_MS)
  }

  private resourceExists(kind: string, name: string): boolean {
    return this.existsStmt.get(kind, name)!.found === 1
  }

  private insertResource(id: string, kind: string, name: string, metadatas: string, spec: string, status: string) {
    this.insertStmt.run(id, kind, name, metadatas, spec, status)
  }

  private selectResource<K extends ResourceKind>(kind: K, name: string): ResourceDefinition<K> | undefined {
    const row = this.selectStmt.get(kind, name)
    if (row == null) {
      return undefined
    }
    return {
      kind,
      spec: JSON.parse(row?.spec ?? '{}') as ResourceSpec<K>,
      metadatas: JSON.parse(row?.metadatas ?? '{}') as ResourceMetadatas,
      status: JSON.parse(row?.status ?? '{}') as ResourceStatus<K>,
    }
  }

  private selectAllResourcesIdForFinalDeletion(): { id: string; kind: ResourceKind }[] {
    const rows = this.selectAllMetadatasStmt.all()
    if (rows == null) {
      return []
    }
    return rows
      .filter((row) => {
        const metadatas = JSON.parse(row.metadatas) as ResourceMetadatas
        return metadatas.deletionTimestamp != null && metadatas.finalizers.length === 0
      })
      .map((row) => ({ id: row.id, kind: row.kind }))
  }

  private deleteResourceById(id: string) {
    this.deleteStmt.run(id)
  }

  private selectResourceById<K extends ResourceKind>(id: string): ResourceDefinition<K> | undefined {
    const row = this.selectByIdStmt.get(id)
    if (row == null) {
      return undefined
    }
    return {
      kind: row.kind as K,
      spec: JSON.parse(this.selectStmt.get(row.kind, row.name)?.spec ?? '{}') as ResourceSpec<K>,
      metadatas: JSON.parse(this.selectStmt.get(row.kind, row.name)?.metadatas ?? '{}') as ResourceMetadatas,
      status: JSON.parse(this.selectStmt.get(row.kind, row.name)?.status ?? '{}') as ResourceStatus<K>,
    }
  }

  private updateResource<K extends ResourceKind>(
    kind: K,
    name: string,
    metadatas: ResourceMetadatas,
    spec: ResourceSpec<K>,
    status: ResourceStatus<K>,
  ) {
    this.updateStmt.run(JSON.stringify(metadatas), JSON.stringify(spec), JSON.stringify(status), kind, name)
  }

  private getDefaultStatus<K extends ResourceKind>(kind: K): ResourceStatus<K> {
    return DEFAULT_STATUS[kind]
  }

  public createResource<K extends ResourceKind>(
    params: {
      kind: K
      metadatas: CreateResourceMetadatas
      spec: ResourceSpec<K>
    },
    role: CubeRole,
  ): ResourceDefinition<K> {
    if (!CREATE_RESOURCE_POLICY[params.kind].includes(role)) {
      throw new ForbiddenError(`Role ${role} is not authorized to create resource of kind ${params.kind}`)
    }

    if (this.resourceExists(params.kind, params.metadatas.name)) {
      throw new ResourceAlreadyExistsError(params.kind, params.metadatas.name)
    }

    const id = uuid()
    const metadatas: ResourceMetadatas = {
      id,
      ...params.metadatas,
      creationTimestamp: new Date().getTime(),
      resourceVersion: 1,
      finalizers: [],
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

    const definition: ResourceDefinition<K> = {
      kind: params.kind,
      metadatas,
      status,
      spec: params.spec,
    }

    this.watchManager.onCreate(definition)

    return definition
  }

  public patchResource<K extends ResourceKind>(
    params: { kind: K; name: string; patch: JsonObject },
    role: CubeRole,
  ): ResourceDefinition<K> {
    assertPatchAllowed(params.kind, role, params.patch)

    const current = this.selectResource(params.kind, params.name)
    if (current == null) throw new ResourceNotFoundError(params.kind, params.name)

    const merged = applyMergePatch(current, params.patch) as typeof current

    const validators = VALIDATORS[params.kind]
    if (!validateMetadatas(merged.metadatas) || !validators.spec(merged.spec) || !validators.status(merged.status)) {
      throw new InvalidPatchError('Patched resource does not match its schema')
    }

    if (JSON.stringify(merged) === JSON.stringify(current)) {
      return { ...current }
    }

    merged.metadatas = { ...merged.metadatas, resourceVersion: current.metadatas.resourceVersion + 1 }
    this.updateResource(params.kind, params.name, merged.metadatas, merged.spec, merged.status)

    const definition: ResourceDefinition<K> = { ...merged }
    this.watchManager.onUpdate(definition)
    return definition
  }

  public markResourceForDeletion<K extends ResourceKind>(kind: K, name: string, role: CubeRole): ResourceDefinition<K> {
    if (!DELETE_RESOURCE_POLICY[kind].includes(role)) {
      throw new ForbiddenError(`Role ${role} is not authorized to delete resource of kind ${kind}`)
    }

    const current = this.selectResource(kind, name)
    if (current == null) throw new ResourceNotFoundError(kind, name)

    const definition = this.patchResource(
      { kind, name, patch: { metadatas: { deletionTimestamp: new Date().getTime() } } },
      CubeRole.API_SERVER,
    )

    this.finalDeletionTick()

    return definition
  }

  private finalDeletionTick() {
    for (const resource of this.selectAllResourcesIdForFinalDeletion()) {
      const definition = this.selectResourceById(resource.id)
      this.deleteResourceById(resource.id)
      this.watchManager.onDelete(definition!)
    }
  }

  public [Symbol.dispose]() {
    clearInterval(this.finalDeletionTimeout)
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    resourcesStore: ResourcesStore
  }
}

const resourcesStorePlugin: FastifyPluginAsync = async (fastify) => {
  const resourcesStore = new ResourcesStore(fastify.db, fastify.watchManager)

  fastify.decorate('resourcesStore', resourcesStore)

  fastify.addHook('onClose', (_instance, done) => {
    resourcesStore[Symbol.dispose]()
    done()
  })
}

export default fp(resourcesStorePlugin)
