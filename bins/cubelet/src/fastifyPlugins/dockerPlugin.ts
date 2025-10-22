import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import logger from '../logger'
import fp from 'fastify-plugin'
import { Resource, ResourceEventType } from './resourcesPlugin'
import Docker from 'dockerode'
import { ContainerResource, ContainerSpec } from 'common-components/dist/manifest/container'

declare module 'fastify' {
  interface FastifyInstance {
    containers: Docker.ContainerInfo[]
  }
}

const docker = new Docker({ socketPath: '/var/run/docker.sock' })

const childLogger = logger.child({ plugin: 'dockerPlugin' })

async function pullImage(
  fastify: FastifyInstance,
  containerSpec: ContainerSpec,
  resourceName: string,
) {
  return new Promise<void>((resolve, reject) => {
    docker.pull(containerSpec.image, (err: Error) => {
      if (err) {
        childLogger.error({ err }, `Error pulling image ${containerSpec.image}`)
        return reject(err)
      }
      childLogger.info(`Successfully pulled image ${containerSpec.image}`)
      fastify.createEventForResource(
        resourceName,
        ResourceEventType.PULLED,
        `Successfully pulled image ${containerSpec.image}`,
      )
      resolve()
    })
  })
}

async function startContainer(
  fastify: FastifyInstance,
  containerSpec: ContainerSpec,
  resourceName: string,
) {
  const images = await docker.listImages()
  if (!images.some((img) => img.RepoTags && img.RepoTags.includes(containerSpec.image))) {
    fastify.createEventForResource(
      resourceName,
      ResourceEventType.PULLING,
      `Pulling image ${containerSpec.image}`,
    )
    childLogger.info(`Pulling image ${containerSpec.image} for container ${containerSpec.name}`)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await pullImage(fastify, containerSpec, resourceName)
        break
      } catch (err) {
        if (attempt === 3) {
          fastify.createEventForResource(
            resourceName,
            ResourceEventType.PULL_LOOP_ERROR,
            `Failed to pull image ${containerSpec.image} after 3 attempts`,
          )
          throw err
        }
        childLogger.warn(`Retrying pull for image ${containerSpec.image} (attempt ${attempt})`)
        fastify.createEventForResource(
          resourceName,
          ResourceEventType.PULL_ERROR,
          `Failed to pull image ${containerSpec.image} (attempt ${attempt}, retrying...)`,
        )
        await new Promise((res) => setTimeout(res, 2000))
      }
    }
  } else {
    fastify.createEventForResource(
      resourceName,
      ResourceEventType.PULLING,
      `Successfully pulled image ${containerSpec.image}`,
    )
    childLogger.info(`Image ${containerSpec.image} already present locally`)
  }

  const container = await docker.createContainer({
    Image: containerSpec.image,
    name: containerSpec.name,
    Env: containerSpec.env
      ? Object.entries(containerSpec.env).map(([key, value]) => `${key}=${value}`)
      : undefined,
  })
  fastify.createEventForResource(
    resourceName,
    ResourceEventType.STARTED,
    `Successfully started container ${containerSpec.name}`,
  )
  await container.start()
}

async function reconcileContainer(
  fastify: FastifyInstance,
  containerSpec: ContainerSpec,
  resourceName: string,
) {
  const containerName = containerSpec.name
  const existingContainer = fastify.containers.find((c) => c.Names.includes(`/${containerName}`))
  if (existingContainer) {
    childLogger.info(`Container ${containerName} already exists with ID ${existingContainer.Id}`)
    // TODO reconile container state if needed
  } else {
    childLogger.info(`Creating and starting container ${containerName}`)
    await startContainer(fastify, containerSpec, resourceName)
  }
}

async function reconcileResource(fastify: FastifyInstance, resource: Resource) {
  if (resource.type === ContainerResource.type) {
    await reconcileContainer(fastify, resource.spec, resource.metadata!.name!)
  }
}

const dockerPlugin: FastifyPluginAsync = async (fastify) => {
  const containers = await docker.listContainers()
  fastify.decorate('containers', containers)
  childLogger.info(`Loaded ${containers.length} Docker containers from the Docker daemon`)
  childLogger.debug('Containers: %o', containers)

  fastify.resourceChangedSignal.on('update', (resourceName: string) => {
    const resource = fastify.resources.find((res) => res.metadata!.name! === resourceName)
    if (resource) {
      reconcileResource(fastify, resource)
    }
  })

  fastify.addHook('onClose', () => {
    fastify.resourceChangedSignal.removeAllListeners('update')
  })

  for (const resource of fastify.resources) {
    if (resource.scheduledOn !== fastify.args.name) continue
    reconcileResource(fastify, resource)
  }

  docker.getEvents({}, (err, stream) => {
    if (err) {
      childLogger.error({ err }, 'Error getting Docker events')
      return
    }
    if (!stream) {
      childLogger.error('Docker events stream is null')
      return
    }
    stream.on('data', (data: Buffer) => {
      const event = JSON.parse(data.toString())
      if (event.Type === 'container' && ['start', 'stop', 'die'].includes(event.Action)) {
        docker
          .listContainers()
          .then((updatedContainers) => {
            fastify.containers = updatedContainers
            childLogger.info(
              `Updated containers list, now has ${updatedContainers.length} containers`,
            )
          })
          .catch((err) => {
            childLogger.error({ err }, 'Error updating containers list')
          })
      }
      if (event.Type === 'container' && event.Action === 'start') {
        const containerName = event.Actor.Attributes.name
        for (const resource of fastify.resources) {
          if (resource.type === ContainerResource.type && resource.spec.name === containerName) {
            fastify.createEventForResource(
              resource.metadata!.name!,
              ResourceEventType.READY,
              `Container ${containerName} is ready`,
            )
          }
        }
      }
    })
  })
}

export default fp(dockerPlugin)
