import { io } from 'socket.io-client'
import logger from '../logger'
import {
  EventBusErrorNotification,
  EventBusInitializedNotification,
  EventBusSubscribeRequest,
  EventBusUpdateResourceNotification,
  InferMessageContent,
  InferMessageResponse,
  ResourceDefinition,
} from 'common-components'
import { EventEmitter } from 'stream'

export class EventBus {
  private host: string
  private port: number
  private name: string
  private socket: ReturnType<typeof io> | null = null
  private emitter = new EventEmitter()

  constructor(host: string, port: number, name: string) {
    this.host = host
    this.port = port
    this.name = name
  }

  get url() {
    return `http://${this.host}:${this.port}`
  }

  public async connect() {
    const socket = io(this.url)
    this.socket = socket
    socket.on('connect', () => {
      logger.debug(`Connected to EventBus at ${this.url} as node ${this.name}`)
      const body: InferMessageContent<typeof EventBusSubscribeRequest> = { name: this.name }
      socket.emit(
        EventBusSubscribeRequest.message,
        body,
        (response: InferMessageResponse<typeof EventBusSubscribeRequest>) => {
          if (response.success) {
            logger.info(`Successfully subscribed to EventBus as node ${this.name}`)
          } else {
            throw new Error(
              `Failed to subscribe to EventBus as node ${this.name}: ${response.message ?? 'unknown error'}`,
            )
          }
        },
      )
    })
    socket.on(
      EventBusErrorNotification.message,
      (body: InferMessageContent<typeof EventBusErrorNotification>) => {
        logger.error(`Received EventBus error notification: ${body.code} - ${body.message}`)
      },
    )
    socket.on(
      EventBusUpdateResourceNotification.message,
      (body: InferMessageContent<typeof EventBusUpdateResourceNotification>) => {
        this.receiveResource(body.resource)
      },
    )
    socket.on(
      EventBusInitializedNotification.message,
      (body: InferMessageContent<typeof EventBusInitializedNotification>) => {
        for (const resource of body.resources) {
          this.receiveResource(resource)
        }
        this.emitter.emit('initialized')
      },
    )
    socket.on('disconnect', () => {
      logger.warn(`Disconnected from EventBus at ${this.url}`)
    })
    socket.connect()
  }

  private receiveResource(resource: ResourceDefinition) {
    logger.debug(
      `Received resource update from EventBus: ${resource.type}/${resource.metadata!.name}`,
    )
    this.emitter.emit('resource', resource)
  }

  public on(event: 'resource' | 'initialized', listener: (data?: any) => void) {
    this.emitter.on(event, listener)
  }

  [Symbol.dispose]() {
    if (this.socket) {
      this.socket.disconnect()
    }
    this.emitter.removeAllListeners()
  }
}
