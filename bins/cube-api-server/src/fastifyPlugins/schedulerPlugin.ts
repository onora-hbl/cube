import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { Resource } from './resourcesPlugin'
import { NodeStatus } from 'common-components/dist/api/api-server/node'
import { Node } from './nodesPlugin'
import logger from '../logger'

const childLogger = logger.child({ plugin: 'scheduler' })

const SCHEDULER_TICK_INTERVAL_MS = 1000

export enum SchedulerType {
  RANDOM = 'RANDOM',
}

abstract class Scheduler {
  protected fastify: FastifyInstance
  private intervalId?: NodeJS.Timeout

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
    this.intervalId = setInterval(() => {
      this.tick()
    }, SCHEDULER_TICK_INTERVAL_MS)

    this.fastify.nodeStore.on('reschedule', (node: Node) => {
      for (const resource of this.fastify.resourceStore.getAll()) {
        if (resource.nodeUuid === node.uuid) {
          childLogger.info(`Unscheduling resource ${resource.metadata.name} from node ${node.name}`)
          this.fastify.resourceStore.updateResourceNode(resource.uuid, undefined)
        }
      }
    })
  }

  abstract schedule(resource: Resource): Promise<string | undefined>

  private async tick() {
    for (const resource of this.fastify.resourceStore.getAll()) {
      if (resource.nodeUuid == null) {
        const nodeUuid = await this.schedule(resource)
        if (nodeUuid == null) {
          continue
        }
        childLogger.info(`Scheduling resource ${resource.metadata.name} to node ${nodeUuid}`)
        this.fastify.resourceStore.updateResourceNode(resource.uuid, nodeUuid)
      }
    }
  }

  [Symbol.dispose]() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
  }
}

class RandomScheduler extends Scheduler {
  constructor(fastify: FastifyInstance) {
    super(fastify)
  }

  async schedule(_: Resource): Promise<string | undefined> {
    const healthyNodes = this.fastify.nodeStore
      .getAll()
      .filter((node) => node.status === NodeStatus.READY)
    if (healthyNodes.length === 0) {
      return undefined
    }
    const randomIndex = Math.floor(Math.random() * healthyNodes.length)
    const selectedNode = healthyNodes[randomIndex]
    return selectedNode.uuid
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    scheduler: Scheduler
  }
}

const schedulerPlugin: FastifyPluginAsync<{ type: SchedulerType }> = async (fastify, { type }) => {
  const scheduler = (() => {
    switch (type) {
      case SchedulerType.RANDOM:
        return new RandomScheduler(fastify)
    }
  })()
  fastify.decorate('scheduler', scheduler)

  fastify.addHook('onClose', async () => {
    scheduler[Symbol.dispose]()
  })
}

export default fp(schedulerPlugin)
