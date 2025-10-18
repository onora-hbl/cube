import {
  CubeApiHealthEndpoint,
  CubeApiRegisterFollowerEndpoint,
  InferResponse,
  ServerMode,
  ServerStatus,
  InferRequest,
  NodeStatus,
} from 'common-components'
import fp from 'fastify-plugin'
import logger from '../logger'
import { FastifyInstance } from 'fastify'

export type Node = {
  name: string
  host: string
  mode: ServerMode
  status: NodeStatus
}

declare module 'fastify' {
  interface FastifyInstance {
    knownNodes: Node[]
    initAsFollower: () => Promise<void>
    initAsLeader: () => Promise<void>
    registerNode: (node: Node) => void
  }
}

const childLogger = logger.child({ plugin: 'nodesPlugin' })

export class HealthCheckError extends Error {
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'HealthCheckError'
  }
}

async function healthCheckNode(node: Node) {
  const res = await fetch(`http://${node.host}${CubeApiHealthEndpoint.url}`, {
    method: CubeApiHealthEndpoint.method,
  })
  if (!res.ok) {
    throw new HealthCheckError(
      `Health check to node ${node.name} at ${node.host} failed with status ${res.status}`,
      res.status,
    )
  }
  const healthData: InferResponse<typeof CubeApiHealthEndpoint> = await res.json()
  return healthData
}

async function initLeader(fastify: FastifyInstance) {
  const healthCheckAll = async () => {
    await Promise.all(
      fastify.knownNodes.map(async (node) => {
        try {
          const healthData = await healthCheckNode(node)
          if (healthData.status !== ServerStatus.OK) {
            childLogger.error(`Node ${node.name} at ${node.host} is not healthy`)
            node.status = NodeStatus.UNHEALTHY
          } else {
            childLogger.debug(`Node ${node.name} at ${node.host} is healthy`)
            node.status = NodeStatus.HEALTHY
          }
        } catch (err) {
          node.status = NodeStatus.UNAVAILABLE
          if (err instanceof HealthCheckError) {
            childLogger.error(err.message)
          } else {
            childLogger.error(
              `Unexpected error during health check to node ${node.name} at ${node.host}: ${err}`,
            )
          }
        }
      }),
    )
  }

  const healthCheckIntervalId = setInterval(healthCheckAll, 10_000)

  fastify.addHook('onClose', async () => {
    clearInterval(healthCheckIntervalId)
  })

  await healthCheckAll()
}

async function initFollower(fastify: FastifyInstance, knownNodes: Node[]) {
  if (knownNodes.length > 1) {
    throw new Error('Follower node cannot have more than one known node (the leader)')
  }
  if (knownNodes.length === 1) {
    const leaderNode = knownNodes[0]
    if (leaderNode.host !== `${fastify.args.leaderHost}:${fastify.args.leaderPort}`) {
      childLogger.warn(
        `Known leader node host ${leaderNode.host} does not match configured leader host ${fastify.args.leaderHost}:${fastify.args.leaderPort}, removing known node and using configured leader host instead`,
      )
      knownNodes.pop()
      fastify.db
        .prepare(
          `
DELETE FROM node WHERE name = ?;
`,
        )
        .run(leaderNode.name)
    }
  }
  if (knownNodes.length === 0) {
    const leaderNode: Node = {
      name: 'leader',
      host: `${fastify.args.leaderHost}:${fastify.args.leaderPort}`,
      mode: ServerMode.LEADER,
      status: NodeStatus.UNKNOWN,
    }
    const body: InferRequest<typeof CubeApiRegisterFollowerEndpoint> = {
      name: fastify.args.name,
      port: fastify.args.port,
    }
    const res = await fetch(`http://${leaderNode.host}${CubeApiRegisterFollowerEndpoint.url}`, {
      method: CubeApiRegisterFollowerEndpoint.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${fastify.args.token}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(
        `Failed to register follower node with leader at ${leaderNode.host}, status ${res.status}`,
      )
    }
    fastify.registerNode(leaderNode)
  }
}

const nodesPlugin = async (fastify: FastifyInstance) => {
  let nodes = fastify.db
    .prepare(
      `
SELECT name, host, type FROM node;
`,
    )
    .all()
    .map((node: any) => ({
      ...node,
      mode: node.type,
      status: NodeStatus.UNKNOWN,
    }))

  childLogger.info(`Loaded ${nodes.length} known nodes from database`)

  fastify.decorate('knownNodes', nodes)

  fastify.decorate('initAsFollower', async () => {
    await initFollower(fastify, fastify.knownNodes)
  })
  fastify.decorate('initAsLeader', async () => {
    await initLeader(fastify)
  })

  fastify.decorate('registerNode', (node: Node) => {
    const exists = fastify.knownNodes.find((n: Node) => n.name === node.name)
    if (exists) {
      throw new Error(`Node with name ${node.name} is already registered`)
    }

    fastify.db
      .prepare(
        `
INSERT INTO node (name, host, type) VALUES (?, ?, ?);
`,
      )
      .run(node.name, node.host, node.mode)

    fastify.knownNodes.push(node)
    childLogger.info(`Registered new node: ${node.name} at ${node.host} (${node.mode})`)
  })
}

export default fp(nodesPlugin)
