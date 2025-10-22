import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../logger'
import {
  ApiServerApiRegisterNodeEndpoint,
  InferError,
  InferRequest,
  InferResponse,
} from 'common-components'
import {
  ApiServerApiHeartbeatEndpoint,
  ApiServerApiListNodesEndpoint,
} from 'common-components/dist/api/api-server/node'

const childLogger = logger.child({ route: 'node' })

export const registerNodeHandler = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const body = request.body as InferRequest<typeof ApiServerApiRegisterNodeEndpoint>
  if (!fastify.nodeStore.register(body.name, body.cpuCores, body.memoryMb)) {
    const error: InferError<typeof ApiServerApiRegisterNodeEndpoint> = {
      code: 'NODE_ALREADY_REGISTERED',
      message: `Node with name ${body.name} is already registered`,
    }
    reply.status(409).send(error)
    return
  }
  childLogger.info(
    `Registered new node: ${body.name} (CPU: ${body.cpuCores}, Memory: ${body.memoryMb} MB)`,
  )
  reply.status(200).send()
}

export const hearthbeatHandler = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const body = request.body as InferRequest<typeof ApiServerApiHeartbeatEndpoint>
  const node = fastify.nodeStore.get(body.name)
  if (!node) {
    const error: InferError<typeof ApiServerApiHeartbeatEndpoint> = {
      code: 'NODE_NOT_REGISTERED',
      message: `Node with name ${body.name} is not registered`,
    }
    reply.status(404).send(error)
    return
  }
  fastify.nodeStore.heartbeat(body.name, body.cpuUsagePercent, body.memoryUsageMb)
  reply.status(200).send()
}

export const listNodes = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const nodes: InferResponse<typeof ApiServerApiListNodesEndpoint> = {
    nodes: fastify.nodeStore.getAll().map((node) => ({
      name: node.name,
      status: node.status,
      cpuCores: node.cpuCores,
      memoryMb: node.memoryMb,
      cpuUsagePercent: node.cpuUsagePercent,
      memoryUsageMb: node.memoryUsageMb,
      lastHeartbeatTimestamp: node.lastHeartbeat.getTime(),
    })),
  }
  reply.status(200).send(nodes)
}
