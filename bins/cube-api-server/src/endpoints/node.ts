import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../logger'
import {
  ApiServerApiRegisterNodeEndpoint,
  InferError,
  InferRequest,
  InferResponse,
} from 'common-components'

const childLogger = logger.child({ route: 'node' })

export const registerNodeHandler = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const body = request.body as InferRequest<typeof ApiServerApiRegisterNodeEndpoint>
  if (!fastify.nodeStore.register(body.name, body.cpuCores, body.memoryMb)) {
    const error: InferError<typeof ApiServerApiRegisterNodeEndpoint> = {
      code: 'NODE_ALREADY_REGISTERED',
      message: `Node with name ${body.name} is already registered`,
    }
    reply.status(409).send(error)
    return
  }
  childLogger.info(
    `Registered new node: ${body.name} (CPU: ${body.cpuCores}, Memory: ${body.memoryMb} MB)`,
  )
  reply.status(200).send()
}
