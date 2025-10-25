import { io } from 'socket.io-client'
import logger from '../logger'
import {
  EventBusErrorNotification,
  EventBusSubscribeRequest,
  InferMessageContent,
  InferMessageResponse,
} from 'common-components'

export class EventBus {
  private host: string
  private port: number
  private name: string
  private socket: ReturnType<typeof io> | null = null

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
    socket.on('disconnect', () => {
      logger.warn(`Disconnected from EventBus at ${this.url}`)
    })
    socket.connect()
  }

  [Symbol.dispose]() {
    if (this.socket) {
      this.socket.disconnect()
    }
  }
}
