#!/usr/bin/env node

const API_SERVER_URL = '127.0.0.1:3000'

async function healthCheck() {
  const res = await fetch(`http://${API_SERVER_URL}/health`)
  if (res.ok) {
    console.log('API server is healthy')
  } else {
    throw new Error('API server is not healthy')
  }
}

async function main() {
  await healthCheck()
}

main().catch((err) => {
  console.error(err)
})
