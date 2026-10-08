import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { ResourcesStore } from './utils/resourcesStore.js'
import type { Filter, WatchManager } from './utils/watchManager.js'
import { CubeRole, NodeReadiness, PodPhase, type ResourceDefinition } from 'cube-types'
import logger from './utils/logger.js'

const POD_SCHEDULER_TICK_INTERVAL_MS = 10_000

const POD_SCHEDULER_FILTER: Filter = ((pod: ResourceDefinition<'pod'>) =>
  pod.spec.nodeName == null && pod.status.phase === PodPhase.PENDING) as Filter

const POD_SCHEDULER_NODE_FILTER: Filter = ((node: ResourceDefinition<'node'>) =>
  node.status.readiness === NodeReadiness.READY) as Filter

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

class PodScheduler {
  private tickInterval: NodeJS.Timeout | null = null
  private unsubscribe: (() => void) | null = null

  constructor(
    private resourcesStore: ResourcesStore,
    private watchManager: WatchManager,
  ) {
    this.tickInterval = setInterval(() => this.tick(), POD_SCHEDULER_TICK_INTERVAL_MS)
    this.unsubscribe = this.watchManager.subscribe(
      'pod',
      (event) => {
        if (event.event === 'ADDED' || event.event === 'MODIFIED') {
          this.treatPod(event.object as ResourceDefinition<'pod'>)
        }
      },
      POD_SCHEDULER_FILTER,
    )
  }

  private selectPossibleNodes() {
    return this.resourcesStore.listResources('node', POD_SCHEDULER_NODE_FILTER)
  }

  private treatPod(pod: ResourceDefinition<'pod'>) {
    const nodes = this.selectPossibleNodes()
    if (nodes.length === 0) {
      logger.warn(`No available nodes to schedule pod ${pod.metadatas.name}`)
      return
    }
    const node = nodes[randomInt(0, nodes.length - 1)]
    this.resourcesStore.patchResource(
      {
        kind: 'pod',
        name: pod.metadatas.name,
        patch: {
          spec: {
            nodeName: node!.metadatas.name,
          },
        },
      },
      CubeRole.POD_SCHEDULER,
    )
    logger.info(`Scheduled pod ${pod.metadatas.name} to node ${node!.metadatas.name}`)
  }

  private tick() {
    const pods = this.resourcesStore.listResources('pod', POD_SCHEDULER_FILTER)
    for (const pod of pods) {
      this.treatPod(pod)
    }
  }

  public [Symbol.dispose]() {
    if (this.tickInterval != null) {
      clearInterval(this.tickInterval)
    }
    if (this.unsubscribe != null) {
      this.unsubscribe()
    }
  }
}

const podSchedulerPlugin: FastifyPluginAsync = async (fastify) => {
  const podScheduler = new PodScheduler(fastify.resourcesStore, fastify.watchManager)

  fastify.addHook('onClose', (_instance, done) => {
    podScheduler[Symbol.dispose]()
    done()
  })
}

export default fp(podSchedulerPlugin)
