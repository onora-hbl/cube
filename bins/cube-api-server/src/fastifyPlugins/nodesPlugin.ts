import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { EventEmitter } from 'stream'
import logger from '../logger'

const childLogger = logger.child({ plugin: 'nodes' })

const CONTROLLER_INTERVAL_MS = 5_000
const TIME_BEFORE_NOT_READY_MS = 15_000
const TIME_BEFORE_RESCHEDULE_MS = 60_000

enum NodeStatus {
  READY = 'ready',
  NOT_READY = 'not_ready',
}

type Node = {
  name: string
  status: NodeStatus
  lastHeartbeat: Date
  cpuCores: number
  memoryMb: number
  hasBeenScheduled: boolean
}

type NodeRecord = {
  name: string
  cpuCores: number
  memoryMb: number
}

class NodeStore {
  private nodes: Map<string, Node> = new Map()
  private emitter = new EventEmitter()
  private controllerInterval: NodeJS.Timeout
  private fastify: FastifyInstance

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
    this.controllerInterval = setInterval(() => {
      for (const node of this.nodes.values()) {
        const now = new Date()
        const diff = now.getTime() - node.lastHeartbeat.getTime()
        if (diff > TIME_BEFORE_NOT_READY_MS && node.status !== NodeStatus.NOT_READY) {
          childLogger.warn(`Node ${node.name} marked as NOT_READY due to missed heartbeats`)
          node.status = NodeStatus.NOT_READY
          this.emitter.emit('update', node)
        }
        if (diff > TIME_BEFORE_RESCHEDULE_MS && !node.hasBeenScheduled) {
          childLogger.warn(
            `Resources on node ${node.name} should be rescheduled due to prolonged unavailability`,
          )
          node.hasBeenScheduled = true
          this.emitter.emit('reschedule', node)
        }
      }
    }, CONTROLLER_INTERVAL_MS)
  }

  public async loadAll() {
    const rows = this.fastify.db
      .prepare(`SELECT name, cpu_cores as cpuCores, memory_mb as memoryMb FROM nodes;`)
      .all() as NodeRecord[]
    childLogger.debug(`Loading ${rows.length} nodes from database`)
    for (const row of rows) {
      const node: Node = {
        name: row.name,
        status: NodeStatus.NOT_READY,
        lastHeartbeat: new Date(),
        cpuCores: row.cpuCores,
        memoryMb: row.memoryMb,
        hasBeenScheduled: false,
      }
      this.nodes.set(row.name, node)
      this.emitter.emit('add', node)
    }
  }

  public async register(name: string, cpuCores: number, memoryMb: number) {
    const existingNode = this.nodes.get(name)
    if (existingNode) {
      return false
    }
    this.fastify.db
      .prepare(`INSERT INTO nodes (name, cpu_cores, memory_mb) VALUES (?, ?, ?);`)
      .run(name, cpuCores, memoryMb)
    const node: Node = {
      name,
      status: NodeStatus.NOT_READY,
      lastHeartbeat: new Date(),
      cpuCores,
      memoryMb,
      hasBeenScheduled: false,
    }
    this.nodes.set(name, node)
    this.emitter.emit('add', node)
    return true
  }

  public getAll(): Node[] {
    return Array.from(this.nodes.values())
  }

  public get(name: string): Node | undefined {
    return this.nodes.get(name)
  }

  public heartbeat(name: string) {
    const node = this.nodes.get(name)
    if (node) {
      node.lastHeartbeat = new Date()
      node.status = NodeStatus.READY
      node.hasBeenScheduled = false
      this.emitter.emit('update', node)
      if (node.status !== NodeStatus.READY) {
        childLogger.info(`Node ${node.name} marked as READY after heartbeat`)
      } else {
        childLogger.debug(`Received heartbeat from node ${node.name}`)
      }
    }
  }

  public on(event: 'add' | 'update' | 'reschedule', listener: (node: Node) => void) {
    this.emitter.on(event, listener)
  }

  [Symbol.dispose]() {
    clearInterval(this.controllerInterval)
    this.emitter.removeAllListeners()
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    nodeStore: NodeStore
  }
}

const nodesPlugin: FastifyPluginAsync = async (fastify) => {
  const nodeStore = new NodeStore(fastify)
  fastify.decorate('nodeStore', nodeStore)

  fastify.addHook('onClose', async () => {
    nodeStore[Symbol.dispose]()
  })

  await nodeStore.loadAll()
}

export default fp(nodesPlugin)
