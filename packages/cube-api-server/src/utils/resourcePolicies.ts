import { CubeRole, type ResourceKind } from 'cube-types'
import type { PatchRule } from './patchPolicies.js'

export const CREATE_RESOURCE_POLICY: Record<ResourceKind, CubeRole[]> = {
  node: [CubeRole.CUBELET],
  pod: [CubeRole.CLI],
}

export const PATCH_POLICY: Record<ResourceKind, PatchRule[]> = {
  node: [
    { pattern: ['status', 'lastHeartbeatTimestamp'], roles: [CubeRole.CUBELET] },
    { pattern: ['status', 'readiness'], roles: [CubeRole.NODE_LIFECYCLE_CONTROLLER] },
    { pattern: ['metadatas', 'finalizers'], roles: [] },
    { pattern: ['spec'], roles: [CubeRole.CUBELET] },
  ],
  pod: [{ pattern: ['status'], roles: [CubeRole.CUBELET] }],
}

export const ALL_KINDS_PATCH_POLICY: PatchRule[] = [
  { pattern: ['metadatas', 'labels'], roles: [CubeRole.CLI] },
  { pattern: ['metadatas', 'finalizers'], roles: [CubeRole.CLI, CubeRole.CUBELET] },
  { pattern: ['metadatas', 'deletionTimestamp'], roles: [CubeRole.API_SERVER] },
]

export const DELETE_RESOURCE_POLICY: Record<ResourceKind, CubeRole[]> = {
  node: [CubeRole.CUBELET, CubeRole.CLI],
  pod: [CubeRole.CLI],
}
