#!/usr/bin/env node

import fs from 'fs/promises'
import {
  CreateResourceDefinitionSchema,
  RESOURCE_KINDS,
  type CreateResourceDefinition,
  type ResourceDefinition,
  type ResourceKind,
} from 'cube-types'
import { Ajv, type JSONSchemaType } from 'ajv'

const API_SERVER_URL = '127.0.0.1:3000'
const API_SERVER_TOKEN = 'cube-cli-token'

type CubeManifest = CreateResourceDefinition<ResourceKind>[]

const CubeManifestSchema: JSONSchemaType<CubeManifest> = {
  type: 'array',
  items: CreateResourceDefinitionSchema,
}
const ajv = new Ajv()
const manifestValidator = ajv.compile(CubeManifestSchema)

async function fetchApiServer(path: string, method = 'GET', body?: object) {
  const headers = new Headers({ Authorization: `Bearer ${API_SERVER_TOKEN}` })
  const fetchOptions: RequestInit = { method, headers }

  if (body != null) {
    headers.set('Content-Type', 'application/json')
    fetchOptions.body = JSON.stringify(body)
  }

  return await fetch(`http://${API_SERVER_URL}${path}`, fetchOptions)
}

async function healthCheck() {
  const res = await fetchApiServer('/health')
  if (res.ok) {
    console.log('API server is healthy')
  } else {
    process.exit(1)
  }
}

async function getResource(kind: ResourceKind) {
  const res = await fetchApiServer(`/resource/${kind}`)
  if (!res.ok) {
    console.error(`Failed to get resources of kind ${kind}: ${res.statusText}`)
    process.exit(1)
  }
  const data = (await res.json()) as { resources: ResourceDefinition<ResourceKind>[] }
  console.log(JSON.stringify(data.resources, null, 2))
}

async function applyResourceDefinition(resource: CreateResourceDefinition<ResourceKind>) {
  const createRes = await fetchApiServer('/resource', 'POST', resource)
  if (createRes.ok) {
    const data = (await createRes.json()) as { resource: ResourceDefinition<ResourceKind> }
    console.log(`Resource ${resource.kind}/${resource.metadatas.name} created successfully`)
    return
  }
  if (createRes.status !== 409) {
    console.error(`Failed to create resource ${resource.kind}/${resource.metadatas.name}: ${createRes.statusText}`)
    return
  }

  const updateRes = await fetchApiServer(`/resource/${resource.kind}/${resource.metadatas.name}`, 'PATCH', {
    metadatas: {
      lavels: resource.metadatas.labels,
      finalizers: resource.metadatas.finalizers,
    },
    spec: resource.spec,
  })
  if (!updateRes.ok) {
    console.error(`Failed to update resource ${resource.kind}/${resource.metadatas.name}: ${updateRes.statusText}`)
    return
  }
  console.log(`Resource ${resource.kind}/${resource.metadatas.name} updated successfully`)
}

async function applyResource(manifestPath: string) {
  if (!manifestPath.endsWith('.json')) {
    console.error('Manifest file must be a JSON file')
    process.exit(1)
  }
  const manifestContent = await fs.readFile(manifestPath, 'utf-8')
  const manifest = JSON.parse(manifestContent) as CubeManifest
  if (!manifestValidator(manifest)) {
    console.error('Invalid manifest file:', manifestValidator.errors)
    process.exit(1)
  }
  for (const resource of manifest) {
    await applyResourceDefinition(resource)
  }
}

async function main() {
  await healthCheck()

  const command = process.argv[2]
  if (command == null) {
    console.error('No command provided')
    process.exit(1)
  }

  if (command === 'get') {
    const kind = process.argv[3]
    if (kind == null) {
      console.error('No kind provided for get command')
      process.exit(1)
    }
    if (!RESOURCE_KINDS.includes(kind)) {
      console.error(`Invalid kind provided for get command. Valid kinds are: ${RESOURCE_KINDS.join(', ')}`)
      process.exit(1)
    }
    await getResource(kind as ResourceKind)
    process.exit(0)
  }

  if (command === 'apply') {
    const manifestPath = process.argv[3]
    if (manifestPath == null) {
      console.error('No manifest path provided for apply command')
      process.exit(1)
    }
    await applyResource(manifestPath)
    process.exit(0)
  }

  console.error(`Unknown command: ${command}`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
})
