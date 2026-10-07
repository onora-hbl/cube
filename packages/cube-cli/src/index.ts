#!/usr/bin/env node

import { RESOURCE_KINDS, type ResourceDefinition, type ResourceKind } from 'cube-types'

const API_SERVER_URL = '127.0.0.1:3000'
const API_SERVER_TOKEN = 'cube-cli-token'

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
  }
}

main().catch((err) => {
  console.error(err)
})
