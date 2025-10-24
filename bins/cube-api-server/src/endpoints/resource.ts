import {
  ApiServerApiApplyEndpoint,
  ApplyAction,
  InferRequest,
  InferResponse,
} from 'common-components'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export const applyHandler = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const body = request.body as InferRequest<typeof ApiServerApiApplyEndpoint>
  const uuid = crypto.randomUUID()
  const name = body.resource.metadata?.name ?? `${body.resource.type}-${uuid}`
  if (fastify.resourceStore.getAll().some((r) => r.metadata.name === name)) {
    // TODO: implement update logic
    const res: InferResponse<typeof ApiServerApiApplyEndpoint> = {
      action: ApplyAction.UPDATE,
      resourceType: body.resource.type,
      resourceName: name,
    }
    return reply.status(200).send(res)
  } else {
    await fastify.resourceStore.registerNewResource(body.resource, uuid, name)
    const res: InferResponse<typeof ApiServerApiApplyEndpoint> = {
      action: ApplyAction.CREATE,
      resourceType: body.resource.type,
      resourceName: name,
    }
    return reply.status(201).send(res)
  }
}
