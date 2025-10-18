import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../logger'
import {
  CubeApiApplyEndpoint,
  CubeApiHealthEndpoint,
  CubeApiNodesEndpoint,
  CubeApiRegisterFollowerEndpoint,
  InferError,
  InferRequest,
  InferResponse,
  ServerMode,
  ServerStatus,
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
    method: CubeApiRegisterFollowerEndpoint.method,
    url: CubeApiRegisterFollowerEndpoint.url,
    schema: CubeApiRegisterFollowerEndpoint.schema,
    preHandler: validateToken,
    handler: (req, rep) => registerFollowerHandler(fastify, req, rep),
  })

  fastify.route({
    method: CubeApiNodesEndpoint.method,
    url: CubeApiNodesEndpoint.url,
    schema: CubeApiNodesEndpoint.schema,
    handler: (req, rep) => nodesHandler(fastify, req, rep),
  })

  fastify.route({
    method: CubeApiApplyEndpoint.method,
    url: CubeApiApplyEndpoint.url,
    schema: CubeApiApplyEndpoint.schema,
    handler: (req, rep) => applyHandler(fastify, req, rep),
  })
}

export default leaderEndpoints
