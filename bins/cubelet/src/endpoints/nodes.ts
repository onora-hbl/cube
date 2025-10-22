import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../logger'
import { CubeletApiNodesEndpoint, InferResponse, NodeStatus } from 'common-components'

const childLogger = logger.child({ route: 'nodes' })

export const nodesHandler = async (
  fastify: FastifyInstance,
  _: FastifyRequest,
  reply: FastifyReply,
) => {
  const res: InferResponse<typeof CubeletApiNodesEndpoint> = {
    nodes: [
      {
        name: fastify.args.name,
        status: NodeStatus.HEALTHY,
        mode: fastify.args.mode,
      },
      ...fastify.knownNodes.map((node) => ({
        name: node.name,
        status: node.status,
        mode: node.mode,
      })),
    ],
  }
  return reply.status(200).send(res)
}
