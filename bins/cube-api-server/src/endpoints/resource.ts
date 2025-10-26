import {
  ApiServerApiApplyEndpoint,
  ApiServerApiListEndpoint,
  ApplyAction,
  InferRequest,
  InferResponse,
  ResourceDefinition,
  ResourceType,
} from 'common-components'
import { PodState } from 'common-components/src/manifest/pod'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Pod } from '../fastifyPlugins/resourcesPlugin'
import { ContainerState } from 'common-components/src/manifest/container'

async function applyPodHandler(
  fastify: FastifyInstance,
  body: InferRequest<typeof ApiServerApiApplyEndpoint>,
  reply: FastifyReply,
) {
  const uuid = crypto.randomUUID()
  const name = body.resource.metadata?.name ?? `${body.resource.type}-${uuid}`
  if (fastify.resourceStore.getAllPods().some((r) => r.metadata.name === name)) {
    // TODO: implement update logic
    const res: InferResponse<typeof ApiServerApiApplyEndpoint> = {
      action: ApplyAction.UPDATE,
      resourceType: body.resource.type,
      resourceName: name,
    }
    return reply.status(200).send(res)
  } else {
    const metadata = {
      name,
      labels: {},
      creationTimestamp: new Date().toISOString(),
      resourceVersion: 1,
      generation: 1,
      ...body.resource.metadata,
    }
    const resource: ResourceDefinition = {
      ...body.resource,
      metadata,
      status: {
        state: PodState.SCHEDULING,
        containerStatuses: Object.fromEntries(
          body.resource.spec.containers.map((c) => [
            c.spec.name,
            {
              state: ContainerState.NOT_CREATED,
            },
          ]),
        ),
      },
    }
    await fastify.resourceStore.registerNewPod(resource, uuid)
    const res: InferResponse<typeof ApiServerApiApplyEndpoint> = {
      action: ApplyAction.CREATE,
      resourceType: body.resource.type,
      resourceName: name,
    }
    return reply.status(201).send(res)
  }
}

export const applyHandler = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const body = request.body as InferRequest<typeof ApiServerApiApplyEndpoint>
  if (body.resource.type === 'pod') {
    return applyPodHandler(fastify, body, reply)
  }
}

function getPodOverview(fastify: FastifyInstance, pod: Pod): Record<string, string> {
  const scheduledNode = pod.nodeUuid != null ? fastify.nodeStore.getByUuid(pod.nodeUuid) : null
  return {
    name: pod.metadata.name,
    status: pod.status.state,
    reason: pod.status.reason ?? '',
    message: pod.status.message ?? '',
    node: scheduledNode ? scheduledNode.name : '',
    creation_time: pod.metadata.creationTime.toISOString(),
  }
}

function listPodsHandler(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const pods = fastify.resourceStore.getAllPods()
  const podsOverview = pods.map((pod) => getPodOverview(fastify, pod))
  const res: InferResponse<typeof ApiServerApiListEndpoint> = {
    resourcesOverview: podsOverview,
  }
  return reply.status(200).send(res)
}

export const listHandler = async (
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const urlParams = ApiServerApiListEndpoint.getUrlParams(request.params)
  const resourceType = urlParams.type as ResourceType
  if (resourceType === 'pod') {
    return listPodsHandler(fastify, request, reply)
  }
}
