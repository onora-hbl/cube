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
import { applyMergePatch, InvalidPatchError } from './mergeUtils.js'

export class ResourceAlreadyExistsError extends Error {
  constructor(kind: string, name: string) {
    super(`Resource of kind "${kind}" with name "${name}" already exists.`)
  }
}

export class NotAuthorizedError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export class ResourceNotFoundError extends Error {
  constructor(kind: string, name: string) {
    super(`Resource of kind "${kind}" with name "${name}" not found.`)
  }
}

const DEFAULT_STATUS: ResourceStatusMap = {
  node: {},
  pod: { phase: PodePhase.PENDING },
}

const CREATE_RESOURCE_POLICY: Record<ResourceKind, CubeRole[]> = {
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
      throw new NotAuthorizedError(`Role ${role} is not authorized to create resource of kind ${params.kind}`)
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

  public [Symbol.dispose]() {}
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
