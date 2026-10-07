import type { ResourceDefinition, ResourceKind } from 'cube-types'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import logger from './logger.js'

type WatchEvent = {
  event: 'ADDED' | 'MODIFIED' | 'DELETED'
  object: ResourceDefinition<ResourceKind>
}

type Change = {
  kind: ResourceKind
  version: number
  previous: ResourceDefinition<ResourceKind> | null
  current: ResourceDefinition<ResourceKind> | null
}

export type Filter = (resource: ResourceDefinition<ResourceKind>) => boolean

type Listener = (event: WatchEvent) => void

type ListenerClient = {
  listener: Listener
  filter: Filter
}

export class WatchManager {
  private listenersByKind = new Map<ResourceKind, Set<ListenerClient>>()

  public subscribe(kind: ResourceKind, callback: Listener, filter?: Filter): () => void {
    let listeners = this.listenersByKind.get(kind)
    if (listeners == null) {
      listeners = new Set()
      this.listenersByKind.set(kind, listeners)
    }
    const client = {
      listener: callback,
      filter: filter ?? ((_: ResourceDefinition<ResourceKind>) => true),
    }
    listeners.add(client)
    return () => {
      listeners.delete(client)
    }
  }

  public recordChange(change: Change) {
    const clients = this.listenersByKind.get(change.kind)
    if (!clients) return
    for (const client of [...clients]) {
      try {
        const watchEvent = this.toWatchEvent(change, client.filter)
        if (watchEvent != null) {
          client.listener(watchEvent)
        }
      } catch (err) {
        logger.error({ err }, 'Watch listener failed')
      }
    }
  }

  private toWatchEvent(change: Change, filter: Filter): WatchEvent | null {
    const before = change.previous !== null && filter(change.previous)
    const after = change.current !== null && filter(change.current)
    if (after && !before) return { event: 'ADDED', object: change.current! }
    if (after && before) return { event: 'MODIFIED', object: change.current! }
    if (!after && before) {
      const last = change.current ?? change.previous!
      return {
        event: 'DELETED',
        object: { ...last, metadatas: { ...last.metadatas, resourceVersion: change.version } },
      }
    }
    return null
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
