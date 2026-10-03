import type { ResourceDefinition, ResourceKind } from 'cube-types'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

export class WatchManager {
  public onCreate<K extends ResourceKind>(definition: ResourceDefinition<K>) {}

  public [Symbol.dispose]() {}
}

declare module 'fastify' {
  interface FastifyInstance {
    watchManager: WatchManager
  }
}

const watchManagerPlugin: FastifyPluginAsync = async (fastify) => {
  const watchManager = new WatchManager()

  fastify.decorate('watchManager', watchManager)

  fastify.addHook('onClose', (_instance, done) => {
    watchManager[Symbol.dispose]()
    done()
  })
}

export default fp(watchManagerPlugin)
