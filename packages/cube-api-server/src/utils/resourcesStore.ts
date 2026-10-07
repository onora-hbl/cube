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
import type { Filter, WatchManager } from './watchManager.js'
import { Ajv, type ValidateFunction } from 'ajv'
import { assertPatchAllowed } from './patchPolicies.js'
import { applyMergePatch, type JsonObject } from './mergeUtils.js'
import { ForbiddenError, InvalidPatchError, ResourceAlreadyExistsError, ResourceNotFoundError } from './errors.js'
import { CREATE_RESOURCE_POLICY, DELETE_RESOURCE_POLICY } from './resourcePolicies.js'

const FINAL_DELETION_INTERVAL_MS = 5_000

const DEFAULT_STATUS: ResourceStatusMap = {
  node: {},
  pod: { phase: PodePhase.PENDING },
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
  private selectAllStmt
  private deleteStmt
  private bumpResourceVersionStmt
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
    this.selectAllStmt = this.db.prepare<
      [],
      { id: string; kind: ResourceKind; metadatas: string; spec: string; status: string }
    >('SELECT id, kind, metadatas, spec, status FROM resources')
    this.deleteStmt = this.db.prepare<[string], void>('DELETE FROM resources WHERE id = ?')
    this.bumpResourceVersionStmt = db.prepare<[], { value: number }>(
      "UPDATE cluster_state SET value = value + 1 WHERE key = 'resource_version' RETURNING value",
    )

    this.finalDeletionTimeout = setInterval(() => this.finalDeletionTick(), FINAL_DELETION_INTERVAL_MS)
  }

  private resourceExists(kind: ResourceKind, name: string): boolean {
    return this.existsStmt.get(kind, name)!.found === 1
  }

  private insertResource<K extends ResourceKind>(
    kind: K,
    metadatas: ResourceMetadatas,
    spec: ResourceSpec<K>,
    status: ResourceStatus<K>,
  ) {
    this.insertStmt.run(
      metadatas.id,
      kind,
      metadatas.name,
      JSON.stringify(metadatas),
      JSON.stringify(spec),
      JSON.stringify(status),
    )
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

  private selectAllResourcesIdForFinalDeletion(): ResourceDefinition<ResourceKind>[] {
    const rows = this.selectAllStmt.all()
    if (rows == null) {
      return []
    }
    return rows
      .filter((row) => {
        const metadatas = JSON.parse(row.metadatas) as ResourceMetadatas
        return metadatas.deletionTimestamp != null && metadatas.finalizers.length === 0
      })
      .map((row) => ({
        kind: row.kind,
        spec: JSON.parse(row.spec) as ResourceSpec<ResourceKind>,
        metadatas: JSON.parse(row.metadatas) as ResourceMetadatas,
        status: JSON.parse(row.status) as ResourceStatus<ResourceKind>,
      }))
  }

  private selectAllResources(): ResourceDefinition<ResourceKind>[] {
    const rows = this.selectAllStmt.all()
    if (rows == null) {
      return []
    }
    return rows.map((row) => ({
      kind: row.kind,
      spec: JSON.parse(row.spec) as ResourceSpec<ResourceKind>,
      metadatas: JSON.parse(row.metadatas) as ResourceMetadatas,
      status: JSON.parse(row.status) as ResourceStatus<ResourceKind>,
    }))
  }

  private deleteResourceById(id: string) {
    this.deleteStmt.run(id)
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

    const writeTransaction = this.db.transaction(() => {
      const version = this.bumpResourceVersionStmt.get()!.value
      const id = uuid()
      const metadatas: ResourceMetadatas = {
        id,
        ...params.metadatas,
        creationTimestamp: new Date().getTime(),
        resourceVersion: version,
        finalizers: [],
        generation: 1,
      }
      const status = this.getDefaultStatus(params.kind)

      this.insertResource(params.kind, metadatas, params.spec, status)

      const definition: ResourceDefinition<K> = {
        kind: params.kind,
        metadatas,
        status,
        spec: params.spec,
      }
      return definition
    })

    const definition = writeTransaction()

    this.watchManager.recordChange({
      kind: definition.kind,
      previous: null,
      current: definition,
      version: definition.metadatas.resourceVersion,
    })

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

    const specChanged = JSON.stringify(merged.spec) !== JSON.stringify(current.spec)

    const writeTransaction = this.db.transaction(() => {
      const version = this.bumpResourceVersionStmt.get()!.value
      const metadatas: ResourceMetadatas = {
        ...merged.metadatas,
        resourceVersion: version,
        generation: current.metadatas.generation + (specChanged ? 1 : 0),
      }
      this.updateResource(params.kind, params.name, metadatas, merged.spec, merged.status)
      return { ...merged, metadatas } as ResourceDefinition<K>
    })

    const definition = writeTransaction()

    this.watchManager.recordChange({
      kind: definition.kind,
      previous: current,
      current: definition,
      version: definition.metadatas.resourceVersion,
    })

    return definition
  }

  public markResourceForDeletion<K extends ResourceKind>(kind: K, name: string, role: CubeRole): ResourceDefinition<K> {
    if (!DELETE_RESOURCE_POLICY[kind].includes(role)) {
      throw new ForbiddenError(`Role ${role} is not authorized to delete resource of kind ${kind}`)
    }

    const current = this.selectResource(kind, name)
    if (current == null) throw new ResourceNotFoundError(kind, name)

    if (current.metadatas.deletionTimestamp != null) {
      return { ...current }
    }

    const definition = this.patchResource(
      { kind, name, patch: { metadatas: { deletionTimestamp: new Date().getTime() } } },
      CubeRole.API_SERVER,
    )

    this.finalDeletionTick()

    return definition
  }

  private finalDeletionTick() {
    for (const resource of this.selectAllResourcesIdForFinalDeletion()) {
      const writeTransaction = this.db.transaction(() => {
        const version = this.bumpResourceVersionStmt.get()!.value
        this.deleteResourceById(resource.metadatas.id)
        return version
      })
      const version = writeTransaction()
      this.watchManager.recordChange({
        kind: resource.kind,
        previous: resource,
        current: null,
        version,
      })
    }
  }

  public listResources<K extends ResourceKind>(kind: K, filter?: Filter): ResourceDefinition<K>[] {
    return this.selectAllResources()
      .filter((resource) => resource.kind === kind)
      .filter((resource) => filter == null || filter(resource)) as ResourceDefinition<K>[]
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
