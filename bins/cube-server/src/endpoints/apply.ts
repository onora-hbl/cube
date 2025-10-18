import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../logger'
import { CubeApiApplyEndpoint, InferRequest, ResourceDefinition } from 'common-components'

const childLogger = logger.child({ route: 'apply' })

async function updateResource(resource: ResourceDefinition, fastify: FastifyInstance) {}

async function createResource(resource: ResourceDefinition, fastify: FastifyInstance) {
  const res = fastify.createResource(resource)
  console.log('Created resource:', res)
}

export const applyHandler = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const body = request.body as InferRequest<typeof CubeApiApplyEndpoint>
  if (fastify.resources.find((r) => r.metadata?.name === body.resource.metadata?.name)) {
    childLogger.info(`Applying already existing resource ${body.resource.metadata?.name}`)
    await updateResource(body.resource, fastify)
  } else {
    childLogger.info(`Applying new resource ${body.resource.metadata?.name}`)
    await createResource(body.resource, fastify)
  }
  return reply.send(200)
}
