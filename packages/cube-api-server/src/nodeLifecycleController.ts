import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { ResourcesStore } from './utils/resourcesStore.js'
import { CubeRole, NodeReadiness } from 'cube-types'
import logger from './utils/logger.js'

const NODE_LIFECYCLE_TICK_INTERVAL_MS = 10_000

const NODE_NOT_READY_TIMEOUT_MS = 60_000

class NodeLifecycleController {
  private tickInterval: NodeJS.Timeout | null = null

  constructor(private resourcesStore: ResourcesStore) {
    this.tickInterval = setInterval(() => this.tick(), NODE_LIFECYCLE_TICK_INTERVAL_MS)
  }

  private tick() {
    const nodes = this.resourcesStore.listResources('node')
    for (const node of nodes) {
      const now = new Date().getTime()
      const lastHeartbeat = node.status?.lastHeartbeatTimestamp ?? 0
      const sinceLastHeartbeat = now - lastHeartbeat

      const readiness = sinceLastHeartbeat > NODE_NOT_READY_TIMEOUT_MS ? NodeReadiness.NOT_READY : NodeReadiness.READY
      if (node.status.readiness !== readiness) {
        logger.info(`Node ${node.metadatas.name} readiness changed to ${readiness}`)
        this.resourcesStore.patchResource(
          { kind: 'node', name: node.metadatas.name, patch: { status: { readiness } } },
          CubeRole.NODE_LIFECYCLE_CONTROLLER,
        )
      }
    }
  }

  public [Symbol.dispose]() {
    if (this.tickInterval != null) {
      clearInterval(this.tickInterval)
    }
  }
}

const nodeLifecycleControllerPlugin: FastifyPluginAsync = async (fastify) => {
  const nodeLifecycleController = new NodeLifecycleController(fastify.resourcesStore)

  fastify.addHook('onClose', (_instance, done) => {
    nodeLifecycleController[Symbol.dispose]()
    done()
  })
}

export default fp(nodeLifecycleControllerPlugin)
