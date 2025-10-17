import { FastifyPluginAsync } from 'fastify'

const commonEndpoints: FastifyPluginAsync = async (fastify) => {
  let isReady = false

  fastify.addHook('onReady', () => {
    isReady = true
  })

  fastify.get('/health', async (_, reply) => {
    if (!isReady) {
      return reply.status(503).send({ status: 'not_ready' })
    }
    return { status: 'ok', mode: fastify.args.mode }
  })
}

export default commonEndpoints
