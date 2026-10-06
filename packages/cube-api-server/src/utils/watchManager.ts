import type { ResourceDefinition, ResourceKind } from 'cube-types'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

type WatchEvent = {
  event: 'ADDED' | 'MODIFIED' | 'DELETED'
  object: ResourceDefinition<ResourceKind>
}

type Listener = (event: WatchEvent) => void

export class WatchManager {
  private listenersByKind = new Map<ResourceKind, Set<Listener>>()

  public subscribe(kind: ResourceKind, callback: Listener): () => void {
    let listeners = this.listenersByKind.get(kind)
    if (listeners == null) {
      listeners = new Set()
      this.listenersByKind.set(kind, listeners)
    }
    listeners.add(callback)
    return () => {
      listeners.delete(callback)
    }
  }

  public onCreate<K extends ResourceKind>(definition: ResourceDefinition<K>) {
    this.dispatch('ADDED', definition)
  }

  public onUpdate<K extends ResourceKind>(definition: ResourceDefinition<K>) {
    this.dispatch('MODIFIED', definition)
  }

  public onDelete<K extends ResourceKind>(definition: ResourceDefinition<K>) {
    this.dispatch('DELETED', definition)
  }

  private dispatch(event: WatchEvent['event'], object: ResourceDefinition<ResourceKind>) {
    const listeners = this.listenersByKind.get(object.kind)
    if (!listeners) return
    for (const listener of [...listeners]) {
      try {
        listener({ event, object })
      } catch (err) {
        logger.error({ err }, 'Watch listener failed')
      }
    }
  }

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
