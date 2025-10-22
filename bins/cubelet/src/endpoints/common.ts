import {
  CubeletApiGetEndpoint,
  CubeletApiHealthEndpoint,
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
    method: CubeletApiHealthEndpoint.method,
    url: CubeletApiHealthEndpoint.url,
    schema: CubeletApiHealthEndpoint.schema,
    handler: async (_, reply) => {
      if (!isReady) {
        const err: InferError<typeof CubeletApiHealthEndpoint> = {
          code: 'NOT_READY',
          message: 'Server not reported as ready',
        }
        return reply.status(503).send(err)
      }
      const res: InferResponse<typeof CubeletApiHealthEndpoint> = {
        status: ServerStatus.OK,
        mode: fastify.args.mode,
      }
      return reply.send(res)
    },
  })

  fastify.route({
    method: CubeletApiGetEndpoint.method,
    url: CubeletApiGetEndpoint.url,
    schema: CubeletApiGetEndpoint.schema,
    handler: (req, rep) => getHandler(fastify, req, rep),
  })
}

export default commonEndpoints
