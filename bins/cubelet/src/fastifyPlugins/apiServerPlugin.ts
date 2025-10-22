import { InferError, InferRequest, InferResponse } from 'common-components'
import {
  ApiServerApiHeartbeatEndpoint,
  ApiServerApiListNodesEndpoint,
  ApiServerApiRegisterNodeEndpoint,
} from 'common-components/dist/api/api-server/node'
import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import os from 'os'
import logger from '../logger'

const HEARTBEAT_INTERVAL_MS = 10_000

class ApiServer {
  private host: string
  private port: number
  private name: string
  private heartbeatInterval: NodeJS.Timeout | null = null

  constructor(host: string, port: number, name: string) {
    this.host = host
    this.port = port
    this.name = name
  }

  get url() {
    return `http://${this.host}:${this.port}`
  }

  private async sendHeartbeat() {
    const body: InferRequest<typeof ApiServerApiHeartbeatEndpoint> = {
      name: this.name,
      cpuUsagePercent: (os.loadavg()[0] / os.cpus().length) * 100,
      memoryUsageMb: Math.floor((os.totalmem() - os.freemem()) / 1024 / 1024),
    }
    const res = await fetch(`${this.url}${ApiServerApiHeartbeatEndpoint.url}`, {
      method: ApiServerApiHeartbeatEndpoint.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const error = (await res.json()) as InferError<typeof ApiServerApiHeartbeatEndpoint>
      throw new Error(`Failed to send heartbeat: ${error.code} - ${error.message}`)
    }
    logger.debug(`Sent heartbeat to API server for node "${this.name}"`)
  }

  async initialize() {
    const listNodesRes = await fetch(`${this.url}${ApiServerApiListNodesEndpoint.url}`, {
      method: ApiServerApiListNodesEndpoint.method,
    })
    const listNodesJson = await listNodesRes.json()
    if (!listNodesRes.ok) {
      const error = listNodesJson as InferError<typeof ApiServerApiListNodesEndpoint>
      throw new Error(`Failed to connect to API server: ${error.code} - ${error.message}`)
    }
    const listedNodes = listNodesJson as InferResponse<typeof ApiServerApiListNodesEndpoint>
    if (!listedNodes.nodes.some((node) => node.name === this.name)) {
      const body: InferRequest<typeof ApiServerApiRegisterNodeEndpoint> = {
        name: this.name,
        cpuCores: os.cpus().length,
        memoryMb: Math.floor(os.totalmem() / 1024 / 1024),
      }
      const registerNodeRes = await fetch(`${this.url}${ApiServerApiRegisterNodeEndpoint.url}`, {
        method: ApiServerApiRegisterNodeEndpoint.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!registerNodeRes.ok) {
        const error = (await registerNodeRes.json()) as InferError<
          typeof ApiServerApiRegisterNodeEndpoint
        >
        throw new Error(`Failed to register node: ${error.code} - ${error.message}`)
      }
      logger.info(`Registered node "${this.name}" with API server`)
    }
    await this.sendHeartbeat()
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS)
  }

  [Symbol.dispose]() {
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

const apiServerPlugin: FastifyPluginAsync<{ host: string; port: number; name: string }> = async (
  fastify,
  options,
) => {
  const apiServer = new ApiServer(options.host, options.port, options.name)
  fastify.decorate('apiServer', apiServer)

  fastify.addHook('onClose', async (fastifyInstance) => {
    fastifyInstance.apiServer[Symbol.dispose]()
  })

  await apiServer.initialize()
}

export default fp(apiServerPlugin)
