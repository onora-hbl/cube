import {
  ApiServerApiApplyEndpoint,
  ApiServerApiListEndpoint,
  ApplyAction,
  InferRequest,
  InferResponse,
  ResourceType,
} from 'common-components'
import { PodStatus, PodType } from 'common-components/src/manifest/pod'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Resource } from '../fastifyPlugins/resourcesPlugin'
import { ContainerStatus } from 'common-components/src/manifest/container'

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

function getContainerOverview(
  fastify: FastifyInstance,
  resource: Resource,
): Record<string, string> {
  const scheduledNode =
    resource.nodeUuid != null ? fastify.nodeStore.getByUuid(resource.nodeUuid) : null
  return {
    name: resource.metadata.name,
    status: resource.status as unknown as ContainerStatus,
    reason: resource.reason ?? '',
    message: resource.message ?? '',
    node: scheduledNode ? scheduledNode.name : '',
    creation_time: resource.metadata.creationTime.toISOString(),
  }
}

function getPodOverview(fastify: FastifyInstance, resource: Resource): Record<string, string> {
  const scheduledNode =
    resource.nodeUuid != null ? fastify.nodeStore.getByUuid(resource.nodeUuid) : null
  return {
    name: resource.metadata.name,
    status: resource.status as unknown as PodStatus,
    reason: resource.reason ?? '',
    message: resource.message ?? '',
    node: scheduledNode ? scheduledNode.name : '',
    creation_time: resource.metadata.creationTime.toISOString(),
  }
}

export const listHandler = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const urlParams = ApiServerApiListEndpoint.getUrlParams(request.params)
  const resourceType = urlParams.type as ResourceType
  const overviewFunction =
    resourceType === PodType
      ? getPodOverview
      : resourceType === 'container'
        ? getContainerOverview
        : () => ({})
  const resources = fastify.resourceStore.getAll().filter((r) => r.resourceType === resourceType)
  const resourcesOverview = resources.map((r) => overviewFunction(fastify, r))
  const res: InferResponse<typeof ApiServerApiListEndpoint> = {
    resourcesOverview,
  }
  return reply.status(200).send(res)
}
