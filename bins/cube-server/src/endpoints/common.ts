import {
  CubeApiGetEndpoint,
  CubeApiHealthEndpoint,
  InferError,
  InferResponse,
  ServerMode,
  ServerStatus,
} from 'common-components'
import { FastifyPluginAsync } from 'fastify'
import { getHandler } from './get'

const commonEndpoints: FastifyPluginAsync = async (fastify) => {
  let isReady = false

  fastify.addHook('onReady', () => {
    isReady = true
    if (fastify.args.mode === ServerMode.FOLLOWER) {
      fastify.initAsFollower()
    }
    if (fastify.args.mode === ServerMode.LEADER) {
      fastify.initAsLeader()
    }
  })

  fastify.route({
    method: CubeApiHealthEndpoint.method,
    url: CubeApiHealthEndpoint.url,
    schema: CubeApiHealthEndpoint.schema,
    handler: async (_, reply) => {
      if (!isReady) {
        const err: InferError<typeof CubeApiHealthEndpoint> = {
          code: 'NOT_READY',
          message: 'Server not reported as ready',
        }
        return reply.status(503).send(err)
      }
      const res: InferResponse<typeof CubeApiHealthEndpoint> = {
        status: ServerStatus.OK,
        mode: fastify.args.mode,
      }
      return reply.send(res)
    },
  })

  fastify.route({
    method: CubeApiGetEndpoint.method,
    url: CubeApiGetEndpoint.url,
    schema: CubeApiGetEndpoint.schema,
    handler: (req, rep) => getHandler(fastify, req, rep),
  })
}

export default commonEndpoints
