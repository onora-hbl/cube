import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import logger from '../logger'

const childLogger = logger.child({ plugin: 'schedulerPlugin' })

abstract class Scheduler {
  protected fastify: FastifyInstance
  protected abstract tick(): void

  private intervalId: NodeJS.Timeout | null = null

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
    this.intervalId = setInterval(() => this.tick(), 1000)
  }

  [Symbol.dispose]() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}

class RandomScheduler extends Scheduler {
  constructor(fastify: FastifyInstance) {
    super(fastify)
  }

  protected tick() {
    for (const resource of this.fastify.resources) {
      if (resource.scheduledOn != null) continue

      const nodes = this.fastify.knownNodes
      const nodeName =
        nodes.length > 0
          ? nodes[Math.floor(Math.random() * nodes.length)].name
          : this.fastify.args.name

      childLogger.info(`Scheduling resource ${resource.metadata!.name!} on node ${nodeName}`)
      this.fastify.scheduleResource(resource.metadata!.name!, nodeName)
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    scheduler: Scheduler
  }
}

const argsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('scheduler', new RandomScheduler(fastify))

  fastify.addHook('onClose', async (instance) => {
    instance.scheduler[Symbol.dispose]()
  })
}

export default fp(argsPlugin)
