import {
  EventBusErrorNotification,
  EventBusSubscribeRequest,
  InferMessageContent,
  InferMessageResponse,
} from 'common-components'
import { NodeStatus } from 'common-components/dist/api/api-server/node'
import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { Socket, Server as SocketIOServer } from 'socket.io'
import logger from '../logger'

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
  }

  public registerNodeSocket(nodeName: string, socket: Socket) {
    logger.info(`Node ${nodeName} connected to EventBus`)
    this.nodeSockets.set(nodeName, socket)
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
