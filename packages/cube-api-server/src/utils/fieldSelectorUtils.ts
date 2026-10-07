import { DEFINITION_SCHEMAS, type ResourceKind } from 'cube-types'
import { InvalidFieldSelector } from './errors.js'
import type { Filter } from './watchManager.js'
import type { SchemaObject } from 'ajv'
import { isJsonObject } from './mergeUtils.js'

enum FilterOperator {
  EQUALS = '=',
  NOT_EQUALS = '!=',
}

const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean'])

function resolveLeafSchema(root: SchemaObject, path: string[]): SchemaObject | undefined {
  let current: SchemaObject | undefined = root
  for (const segment of path) {
    if (current?.type !== 'object') return undefined
    current =
      current.properties?.[segment] ??
      (typeof current.additionalProperties === 'object' ? current.additionalProperties : undefined)
  }
  return current
}

function readPath(resource: unknown, path: string[]): unknown {
  return path.reduce<unknown>((value, segment) => (isJsonObject(value) ? value[segment] : undefined), resource)
}

function getFilter(kind: ResourceKind, selector: string): Filter {
  const operator = selector.includes(FilterOperator.NOT_EQUALS)
    ? FilterOperator.NOT_EQUALS
    : selector.includes(FilterOperator.EQUALS)
      ? FilterOperator.EQUALS
      : null
  if (operator == null) {
    throw new InvalidFieldSelector('Invalid field selector: missing operator')
  }
  if (selector.indexOf(operator) !== selector.lastIndexOf(operator)) {
    throw new InvalidFieldSelector('Invalid field selector: multiple operators')
  }
  const [path, value] = selector.split(operator).map((s) => s.trim())
  const pathSegments = path!.split('.').map((s) => s.trim())

  const leaf = resolveLeafSchema(DEFINITION_SCHEMAS[kind], pathSegments)
  if (leaf == null || !SCALAR_TYPES.has(leaf.type as string)) {
    throw new InvalidFieldSelector(`Invalid field selector: unknown or non-scalar path "${path}"`)
  }
  if (Array.isArray(leaf.enum) && !leaf.enum.includes(value)) {
    throw new InvalidFieldSelector(`Invalid field selector: "${value}" is not allowed for "${path}"`)
  }

  return (resource) => {
    const actual = readPath(resource, pathSegments)
    const matches = actual !== undefined && String(actual) === value
    return operator === FilterOperator.EQUALS ? matches : !matches
  }
}

export function getFilterFromFieldSelector(kind: ResourceKind, fieldSelector: string): Filter {
  const selectors = fieldSelector
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const filters = selectors.map((s) => getFilter(kind, s))
  return (resource) => filters.every((filter) => filter(resource))
}
