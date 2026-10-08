import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import logger from './utils/logger.js'

const HEARTBEAT_INTERVAL_MS = 30_000

export class ApiServer {
  private heartbeatInterval: NodeJS.Timeout | null = null

  constructor(
    private url: string,
    private selfIp: string,
    private selfPort: number,
    private token: string,
    private name: string,
  ) {}

  private async fetchServer(path: string, method = 'GET', body?: object) {
    const headers = new Headers({ Authorization: `Bearer ${this.token}` })
    const fetchOptions: RequestInit = { method, headers }

    if (body != null) {
      headers.set('Content-Type', 'application/json')
      fetchOptions.body = JSON.stringify(body)
    }

    return await fetch(`http://${this.url}${path}`, fetchOptions)
  }

  private startHeartbeatInterval() {
    this.heartbeatInterval = setInterval(() => this.heartbeatTick(), HEARTBEAT_INTERVAL_MS)
    void this.heartbeatTick()
  }

  private async heartbeatTick() {
    const res = await this.fetchServer(`/resource/node/${this.name}/status`, 'PATCH', {
      lastHeartbeatTimestamp: new Date().getTime(),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      logger.error({ err: data }, `Failed to send heartbeat for node ${this.name}: ${res.statusText}`)
    }
  }

  public async selfRegister() {
    const postRes = await this.fetchServer('/resource', 'POST', {
      kind: 'node',
      metadatas: {
        name: this.name,
      },
      spec: {
        address: this.selfIp,
        port: this.selfPort,
      },
    })
    if (postRes.ok) {
      logger.info(`Registered node ${this.name} successfully`)
      this.startHeartbeatInterval()
      return
    }
    if (postRes.status !== 409) {
      const data = await postRes.json().catch(() => ({}))
      logger.error({ err: data }, `Failed to register node ${this.name}: ${postRes.statusText}`)
      setTimeout(this.selfRegister.bind(this), 5000)
    }

    const patchRes = await this.fetchServer(`/resource/node/${this.name}/spec`, 'PATCH', {
      address: this.selfIp,
      port: this.selfPort,
    })
    if (patchRes.ok) {
      logger.info(`Updated node ${this.name} successfully`)
      this.startHeartbeatInterval()
      return
    }

    const data = await patchRes.json().catch(() => ({}))
    logger.error({ err: data }, `Failed to update node ${this.name}: ${patchRes.statusText}`)
    setTimeout(this.selfRegister.bind(this), 5000)
  }

  public [Symbol.dispose]() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    apiServer: ApiServer
  }
}

const apiServerPlugin: FastifyPluginAsync<{
  url: string
  selfIp: string
  selfPort: number
  token: string
  name: string
}> = async (fastify, options) => {
  const apiServer = new ApiServer(options.url, options.selfIp, options.selfPort, options.token, options.name)

  fastify.decorate('apiServer', apiServer)

  fastify.addHook('onClose', (_instance, done) => {
    apiServer[Symbol.dispose]()
    done()
  })
}

export default fp(apiServerPlugin)
