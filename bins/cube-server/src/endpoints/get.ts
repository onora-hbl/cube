import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../logger'
import {
  BaseErrorCode,
  ContainerStatus,
  CubeApiGetEndpoint,
  InferResponse,
} from 'common-components'
import { Resource } from '../fastifyPlugins/resourcesPlugin'
import { ContainerResource } from 'common-components/dist/manifest/container'
import { PodResource } from 'common-components/dist/manifest/pod'

const childLogger = logger.child({ route: 'get' })

async function getContainerOverview(
  resource: Resource,
  fastify: FastifyInstance,
): Promise<InferResponse<typeof CubeApiGetEndpoint>['resources'][number]> {
  childLogger.debug(`Getting overview for container ${resource.metadata!.name!}`)

  return {
    name: resource.metadata!.name!,
    overview: {
      createdAt: resource.metadata!.creationTimestamp!,
      status: ContainerStatus.RUNNING,
    },
  }
}

async function getPodOverview(
  resource: Resource,
  fastify: FastifyInstance,
): Promise<InferResponse<typeof CubeApiGetEndpoint>['resources'][number]> {
  childLogger.debug(`Getting overview for pod ${resource.metadata!.name!}`)

  return {
    name: resource.metadata!.name!,
    overview: {
      createdAt: resource.metadata!.creationTimestamp!,
      status: ContainerStatus.RUNNING,
      ready: 'true',
      containers: '1/1',
    },
  }
}

async function getResourceOverview(
  resource: Resource,
  fastify: FastifyInstance,
): Promise<InferResponse<typeof CubeApiGetEndpoint>['resources'][number]> {
  switch (resource.type) {
    case 'container':
      return getContainerOverview(resource, fastify)
    case 'pod':
      return getPodOverview(resource, fastify)
  }
}

export const getHandler = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const params = CubeApiGetEndpoint.getUrlParams(request.params)
  const res = [] as InferResponse<typeof CubeApiGetEndpoint>['resources']
  for (const resource of fastify.resources) {
    if (resource.type !== params.type) continue
    res.push(await getResourceOverview(resource, fastify))
  }
  reply.send({ resources: res })
}
