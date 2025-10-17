import {
  CubeApiHealthEndpoint,
  CubeApiRegisterFollowerEndpoint,
  InferError,
  InferRequest,
  InferResponse,
  ServerMode,
  ServerStatus,
} from 'common-components'
import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../logger'

const childLogger = logger.child({ route: 'registerFollower' })

export const registerFollowerHandler = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const body: InferRequest<typeof CubeApiRegisterFollowerEndpoint> = request.body as any
  const followerHost = request.ip
  const followerPort = body.port
  const followerName = body.name

  childLogger.debug(
    `Trying to register follower ${followerName} from ${followerHost}:${followerPort}`,
  )

  if (fastify.knownNodes.some((node) => node.name === followerName)) {
    childLogger.error(`Node with name ${followerName} is already registered`)
    const err: InferError<typeof CubeApiRegisterFollowerEndpoint> = {
      code: 'NODE_ALREADY_REGISTERED',
      message: 'Node with this name is already registered',
    }
    return reply.status(400).send(err)
  }

  const res = await fetch(`http://${followerHost}:${followerPort}${CubeApiHealthEndpoint.url}`, {
    method: CubeApiHealthEndpoint.method,
  })
  if (!res.ok) {
    childLogger.error(
      `Health check to server ${followerName} at ${followerHost}:${followerPort} failed with status ${res.status}`,
    )
    const err: InferError<typeof CubeApiRegisterFollowerEndpoint> = {
      code: 'HEALTH_CHECK_FAILED',
      message: 'Health check failed',
    }
    return reply.status(400).send(err)
  }
  const healthData: InferResponse<typeof CubeApiHealthEndpoint> = await res.json()
  if (healthData.status !== ServerStatus.OK) {
    childLogger.error(`Server ${followerName} at ${followerHost}:${followerPort} is not healthy`)
    const err: InferError<typeof CubeApiRegisterFollowerEndpoint> = {
      code: 'SERVER_NOT_HEALTHY',
      message: 'Server is not healthy',
    }
    return reply.status(400).send(err)
  }
  if (healthData.mode !== ServerMode.FOLLOWER) {
    childLogger.error(
      `Server ${followerName} at ${followerHost}:${followerPort} is not in follower mode`,
    )
    const err: InferError<typeof CubeApiRegisterFollowerEndpoint> = {
      code: 'SERVER_NOT_IN_FOLLOWER_MODE',
      message: 'Server is not in follower mode',
    }
    return reply.status(400).send(err)
  }

  fastify.registerNode({
    name: followerName,
    host: `${followerHost}:${followerPort}`,
    type: ServerMode.FOLLOWER,
  })

  return reply.status(200).send()
}
