import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import {
  CubeletApiApplyEndpoint,
  CubeletApiNodesEndpoint,
  CubeletApiRegisterFollowerEndpoint,
} from 'common-components'
import { registerFollowerHandler } from './registerFollower'
import { nodesHandler } from './nodes'
import { applyHandler } from './apply'

const validateToken = (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
  if (!('authorization' in request.headers)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  const headerValue = request.headers['authorization']
  if (headerValue !== `Bearer ${request.server.args.token}`) {
    return reply.status(403).send({ error: 'Forbidden' })
  }
  done()
}

const leaderEndpoints: FastifyPluginAsync = async (fastify) => {
  fastify.route({
    method: CubeletApiRegisterFollowerEndpoint.method,
    url: CubeletApiRegisterFollowerEndpoint.url,
    schema: CubeletApiRegisterFollowerEndpoint.schema,
    preHandler: validateToken,
    handler: (req, rep) => registerFollowerHandler(fastify, req, rep),
  })

  fastify.route({
    method: CubeletApiNodesEndpoint.method,
    url: CubeletApiNodesEndpoint.url,
    schema: CubeletApiNodesEndpoint.schema,
    handler: (req, rep) => nodesHandler(fastify, req, rep),
  })

  fastify.route({
    method: CubeletApiApplyEndpoint.method,
    url: CubeletApiApplyEndpoint.url,
    schema: CubeletApiApplyEndpoint.schema,
    handler: (req, rep) => applyHandler(fastify, req, rep),
  })
}

export default leaderEndpoints
