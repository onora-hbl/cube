import { CubeRole, type ResourceKind } from 'cube-types'
import { isJsonObject, type JsonObject } from './mergeUtils.js'
import { NotAuthorizedError } from './resourcesStore.js'

type Rule = { pattern: string[]; roles: CubeRole[] }

const PATCH_POLICY: Record<ResourceKind, Rule[]> = {
  node: [
    { pattern: ['status'], roles: [CubeRole.CUBELET] },
    { pattern: ['metadatas', 'finalizers'], roles: [] },
  ],
  pod: [{ pattern: ['status'], roles: [CubeRole.CUBELET] }],
}

const ALL_KINDS_POLICY: Rule[] = [
  { pattern: ['metadatas', 'labels'], roles: [CubeRole.CLI] },
  { pattern: ['metadatas', 'finalizers'], roles: [CubeRole.CLI, CubeRole.CUBELET] },
  { pattern: ['metadatas', 'deletionTimestamp'], roles: [CubeRole.API_SERVER] },
]

function matches(pattern: string[], path: string[]): boolean {
  return pattern.length <= path.length && pattern.every((segment, i) => segment === '*' || segment === path[i])
}

function resolveRule(kind: ResourceKind, path: string[]): Rule | undefined {
  return [...PATCH_POLICY[kind], ...ALL_KINDS_POLICY]
    .filter((rule) => matches(rule.pattern, path))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0]
}

function collectLeafPaths(patch: JsonObject, prefix: string[] = []): string[][] {
  return Object.entries(patch).flatMap(([key, value]) =>
    isJsonObject(value) && Object.keys(value).length > 0
      ? collectLeafPaths(value, [...prefix, key])
      : [[...prefix, key]],
  )
}

export function assertPatchAllowed(kind: ResourceKind, role: CubeRole, patch: JsonObject): void {
  for (const path of collectLeafPaths(patch)) {
    if (!resolveRule(kind, path)?.roles.includes(role)) {
      throw new NotAuthorizedError(`Role ${role} cannot patch ${path.join('/')} on ${kind}`)
    }
  }
}
