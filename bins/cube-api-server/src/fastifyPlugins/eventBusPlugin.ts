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
import { Pod } from './resourcesPlugin'
import { EventBusUpdatePodNotification } from 'common-components/dist/socket/resource'
import { PodResourceDefinition } from 'common-components/src/manifest/pod'

function createPodDefinitionFromResource(pod: Pod): PodResourceDefinition {
  return {
    type: 'pod',
    metadata: {
      ...pod.metadata,
      creationTimestamp: pod.metadata.creationTime.toISOString(),
    },
    spec: pod.spec,
    status: pod.status,
  }
}

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

    this.fastify.resourceStore.on('pod.update', (pod) => {
      if (pod.nodeUuid != null) {
        this.sendPodToNode(pod)
      }
    })
  }

  private sendPodToNode(pod: Pod) {
    const node = this.fastify.nodeStore.getByUuid(pod.nodeUuid!)
    if (node == null) {
      logger.error(
        `Tried to send resource pod/${pod.metadata.name} to node with uuid ${pod.nodeUuid}, but node was not found`,
      )
      return
    }
    const socket = this.nodeSockets.get(node.name)
    if (socket == null) {
      logger.error(
        `Tried to send resource pod/${pod.metadata.name} to node ${node.name}, but node is not connected to EventBus`,
      )
      return
    }
    const message: InferMessageContent<typeof EventBusUpdatePodNotification> = {
      definition: createPodDefinitionFromResource(pod),
    }
    socket.emit(EventBusUpdatePodNotification.message, message)
  }

  public registerNodeSocket(nodeName: string, socket: Socket) {
    logger.info(`Node ${nodeName} connected to EventBus`)
    this.nodeSockets.set(nodeName, socket)
    for (const pod of this.fastify.resourceStore.getAllPods()) {
      const node = this.fastify.nodeStore.getByUuid(pod.nodeUuid!)
      if (node != null && node.name === nodeName) {
        const message: InferMessageContent<typeof EventBusUpdatePodNotification> = {
          definition: createPodDefinitionFromResource(pod),
        }
        socket.emit(EventBusUpdatePodNotification.message, message)
      }
    }
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
