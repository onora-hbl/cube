import { CubeApiHealthEndpoint, InferError, InferResponse, ServerStatus } from 'common-components'
import { FastifyPluginAsync } from 'fastify'

const commonEndpoints: FastifyPluginAsync = async (fastify) => {
  let isReady = false

  fastify.addHook('onReady', () => {
    isReady = true
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
}

export default commonEndpoints
