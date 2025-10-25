import {
  EventBusErrorNotification,
  EventBusInitializedNotification,
  EventBusSubscribeRequest,
  EventBusUpdateResourceNotification,
  InferMessageContent,
  InferMessageResponse,
  ResourceDefinition,
} from 'common-components'
import { NodeStatus } from 'common-components/dist/api/api-server/node'
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { Socket, Server as SocketIOServer } from 'socket.io'
import logger from '../logger'
import { Resource } from './resourcesPlugin'

class NodesEventBus {
  private fastify: FastifyInstance
  private nodeSockets: Map<string, Socket> = new Map()

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify

    this.fastify.nodeStore.on('update', (node) => {
      const socket = this.nodeSockets.get(node.name)
      if (socket != null && node.status === NodeStatus.NOT_READY) {
        const error: InferMessageContent<typeof EventBusErrorNotification> = {
          code: 'MISSING_HEARTBEAT',
          message: `Node ${node.name} missed heartbeat`,
        }
        socket.emit(EventBusErrorNotification.message, error)
        socket.disconnect(true)
      }
    })

    this.fastify.resourceStore.on('add', (resource) => {
      if (resource.nodeUuid != null) {
        this.sendResourceToNode(resource)
      }
    })
    this.fastify.resourceStore.on('update', (resource) => {
      if (resource.nodeUuid != null) {
        this.sendResourceToNode(resource)
      }
    })
  }

  private sendResourceToNode(resource: Resource) {
    const node = this.fastify.nodeStore.getByUuid(resource.nodeUuid!)
    if (node == null) {
      logger.warn(
        `Tried to send resource ${resource.resourceType}/${resource.metadata.name} to node with uuid ${resource.nodeUuid}, but no such node exists`,
      )
      return
    }
    const socket = this.nodeSockets.get(node.name)
    if (socket == null) {
      logger.warn(
        `Tried to send resource ${resource.resourceType}/${resource.metadata.name} to node ${node.name}, but it is not connected to the EventBus`,
      )
      return
    }
    const message: InferMessageContent<typeof EventBusUpdateResourceNotification> = {
      resource: this.fastify.resourceStore.createDefinitionFromResource(resource),
    }
    socket.emit(EventBusUpdateResourceNotification.message, message)
  }

  public registerNodeSocket(nodeName: string, socket: Socket) {
    logger.info(`Node ${nodeName} connected to EventBus`)
    this.nodeSockets.set(nodeName, socket)
    const resources: ResourceDefinition[] = []
    for (const resource of this.fastify.resourceStore.getAll()) {
      const node = this.fastify.nodeStore.getByUuid(resource.nodeUuid!)
      if (node != null && node.name === nodeName) {
        resources.push(this.fastify.resourceStore.createDefinitionFromResource(resource))
      }
    }
    const body: InferMessageContent<typeof EventBusInitializedNotification> = {
      resources,
    }
    socket.emit(EventBusInitializedNotification.message, body)
  }

  public unregisterNodeSocket(socket: Socket) {
    for (const [nodeName, nodeSocket] of this.nodeSockets.entries()) {
      if (nodeSocket === socket) {
        logger.info(`Node ${nodeName} disconnected from EventBus`)
        this.nodeSockets.delete(nodeName)
      }
    }
  }

  public connectedNodes(): string[] {
    return Array.from(this.nodeSockets.keys())
  }

  [Symbol.dispose]() {
    this.nodeSockets.forEach((socket) => {
      const error: InferMessageContent<typeof EventBusErrorNotification> = {
        code: 'SERVER_SHUTTING_DOWN',
        message: 'Server is shutting down',
      }
      socket.emit(EventBusErrorNotification.message, error)
      socket.disconnect(true)
    })
    this.nodeSockets.clear()
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    nodesEventBus: NodesEventBus
    io: SocketIOServer
  }
}

const eventBusPlugin: FastifyPluginAsync = async (fastify) => {
  const eventsBus = new NodesEventBus(fastify)
  fastify.decorate('nodesEventBus', eventsBus)

  fastify.addHook('onClose', async () => {
    eventsBus[Symbol.dispose]()
  })

  fastify.io.on('connection', (socket) => {
    socket.on(
      EventBusSubscribeRequest.message,
      (body: InferMessageContent<typeof EventBusSubscribeRequest>, callback) => {
        if (eventsBus.connectedNodes().includes(body.name)) {
          const error: InferMessageResponse<typeof EventBusSubscribeRequest> = {
            success: false,
            message: `Node with name ${body.name} is already connected`,
          }
          callback(error)
          return
        }
        if (!fastify.nodeStore.getAll().some((node) => node.name === body.name)) {
          const error: InferMessageResponse<typeof EventBusSubscribeRequest> = {
            success: false,
            message: `Node with name ${body.name} is not registered`,
          }
          callback(error)
          return
        }
        if (fastify.nodeStore.get(body.name)?.status === NodeStatus.NOT_READY) {
          const error: InferMessageResponse<typeof EventBusSubscribeRequest> = {
            success: false,
            message: `Node with name ${body.name} is not ready`,
          }
          callback(error)
          return
        }
        eventsBus.registerNodeSocket(body.name, socket)
        const res: InferMessageResponse<typeof EventBusSubscribeRequest> = {
          success: true,
        }
        callback(res)
      },
    )

    socket.on('disconnect', () => {
      eventsBus.unregisterNodeSocket(socket)
    })
  })
}

export default fp(eventBusPlugin)
