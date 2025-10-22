import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import logger from '../logger'
import { ContainerStatus, CubeletApiGetEndpoint, InferResponse } from 'common-components'
import { Resource, ResourceEventType } from '../fastifyPlugins/resourcesPlugin'

const childLogger = logger.child({ route: 'get' })

function getContainerStatusFromEvents(resource: Resource): ContainerStatus {
  const events = resource.events || []
  events.sort((a, b) => b.happenedAt.getTime() - a.happenedAt.getTime())
  const latestEvent = events[0]
  if (!latestEvent) {
    return ContainerStatus.SCHEDULING
  }
  if (latestEvent.type == ResourceEventType.CREATED) {
    return ContainerStatus.SCHEDULING
  }
  if (latestEvent.type == ResourceEventType.SCHEDULED) {
    return ContainerStatus.STARTING
  }
  if (latestEvent.type == ResourceEventType.PULLING) {
    return ContainerStatus.STARTING
  }
  if (latestEvent.type == ResourceEventType.PULLED) {
    return ContainerStatus.STARTING
  }
  if (latestEvent.type == ResourceEventType.PULL_ERROR) {
    return ContainerStatus.STARTING
  }
  if (latestEvent.type == ResourceEventType.PULL_LOOP_ERROR) {
    return ContainerStatus.CRASH
  }
  if (latestEvent.type == ResourceEventType.STARTED) {
    return ContainerStatus.STARTING
  }
  if (latestEvent.type == ResourceEventType.READY) {
    return ContainerStatus.RUNNING
  }
  if (latestEvent.type == ResourceEventType.FAILED) {
    return ContainerStatus.CRASH
  }
  if (latestEvent.type == ResourceEventType.TERMINATED) {
    return ContainerStatus.FINISHED
  }
  if (latestEvent.type == ResourceEventType.DELETED) {
    return ContainerStatus.DELETING
  }
  return ContainerStatus.SCHEDULING
}

async function getContainerOverview(
  resource: Resource,
  fastify: FastifyInstance,
): Promise<InferResponse<typeof CubeletApiGetEndpoint>['resources'][number]> {
  childLogger.debug(`Getting overview for container ${resource.metadata!.name!}`)

  return {
    name: resource.metadata!.name!,
    overview: {
      createdAt: resource.metadata!.creationTimestamp!,
      status: getContainerStatusFromEvents(resource),
    },
  }
}

async function getPodOverview(
  resource: Resource,
  fastify: FastifyInstance,
): Promise<InferResponse<typeof CubeletApiGetEndpoint>['resources'][number]> {
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
): Promise<InferResponse<typeof CubeletApiGetEndpoint>['resources'][number]> {
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
  const params = CubeletApiGetEndpoint.getUrlParams(request.params)
  const res = [] as InferResponse<typeof CubeletApiGetEndpoint>['resources']
  for (const resource of fastify.resources) {
    if (resource.type !== params.type) continue
    res.push(await getResourceOverview(resource, fastify))
  }
  reply.send({ resources: res })
}
