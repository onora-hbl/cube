import { InvalidPatchError } from './errors.js'

export type JsonObject = Record<string, unknown>

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function wrapPatch(path: string[], body: unknown): JsonObject {
  if (body === undefined) throw new InvalidPatchError('Missing body')
  const patch = path.reduceRight<unknown>((inner, segment) => ({ [segment]: inner }), body)
  if (!isJsonObject(patch)) throw new InvalidPatchError('Patch must be a JSON object')
  return patch
}

export function applyMergePatch(target: unknown, patch: unknown): unknown {
  if (!isJsonObject(patch)) return patch
  const result: JsonObject = isJsonObject(target) ? { ...target } : {}
  for (const [key, value] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(key)) throw new InvalidPatchError(`Forbidden key "${key}"`)
    if (value === null) delete result[key]
    else result[key] = applyMergePatch(result[key], value)
  }
  return result
}
