import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../logger'
import {
  CubeApiHealthEndpoint,
  CubeApiRegisterFollowerEndpoint,
  InferError,
  InferRequest,
  InferResponse,
  ServerMode,
  ServerStatus,
} from 'common-components'
import { registerFollowerHandler } from './registerFollower'

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
}

export default leaderEndpoints
