import { Mutex } from 'async-mutex'
import logger from '../logger'
import { EventBus } from './EventBus'
import { ContainerEventType, ContainerSpec } from 'common-components/dist/manifest/container'
import { DockerEvent, DockerManager } from './DockerManager'
import { PodResourceDefinition } from 'common-components/dist/manifest/pod'
import Docker from 'dockerode'

const childLogger = logger.child({ component: 'PodReconciler' })

export class PodReconciler {
  private mutex = new Mutex()

  constructor(
    private resource: PodResourceDefinition,
    private docker: DockerManager,
    private eventBus: EventBus,
  ) {
    this.docker.onResourceContainerEvent(this.resourceName, this.handleDockerEvent.bind(this))
  }

  get resourceName() {
    return `pod/${this.resource.metadata!.name!}`
  }

  public updateResource(resource: PodResourceDefinition) {
    this.resource = resource
  }

  async createContainer(spec: ContainerSpec) {
    const image = spec.image
    if (!(await this.docker.imageExists(image))) {
      childLogger.info(`Pulling image ${image} for pod ${this.resource.metadata!.name!}`)
      try {
        this.eventBus.addEventToPodContainer(this.resourceName, spec.name, {
          type: ContainerEventType.IMAGE_PULL_STARTED,
          message: `Pulling image ${image} for container ${spec.name}`,
        })
        await this.docker.pullImage(image)
        childLogger.info(
          `Successfully pulled image ${image} for pod ${this.resource.metadata!.name!}`,
        )
        this.eventBus.addEventToPodContainer(this.resourceName, spec.name, {
          type: ContainerEventType.IMAGE_PULL_SUCCEEDED,
          message: `Successfully pulled image ${image} for container ${spec.name}`,
        })
      } catch (err) {
        childLogger.error(
          { err },
          `Failed to pull image ${image} for pod ${this.resource.metadata!.name!}`,
        )
        this.eventBus.addEventToPodContainer(this.resourceName, spec.name, {
          type: ContainerEventType.IMAGE_PULL_FAILED,
          message: `Failed to pull image ${image} for container ${spec.name}: ${err}`,
        })
        return
      }
    } else {
      this.eventBus.addEventToPodContainer(this.resourceName, spec.name, {
        type: ContainerEventType.IMAGE_ALREADY_PRESENT,
        message: `Image ${image} already present for container ${spec.name}`,
      })
    }
    try {
      childLogger.info(`Creating container for pod ${this.resource.metadata!.name!}`)
      const container = await this.docker.createContainer(this.resourceName, spec)
      childLogger.info(`Successfully created container for pod ${this.resource.metadata!.name!}`)
      this.eventBus.addEventToPodContainer(this.resourceName, spec.name, {
        type: ContainerEventType.CREATED,
        message: `Successfully created container ${spec.name}`,
      })
      return container
    } catch (err) {
      childLogger.error(
        { err },
        `Failed to create container for pod ${this.resource.metadata!.name!}`,
      )
      this.eventBus.addEventToPodContainer(this.resourceName, spec.name, {
        type: ContainerEventType.FAILED,
        message: `Failed to create container ${spec.name} for pod ${this.resource.metadata!.name!}`,
      })
      return
    }
  }

  async startContainer({ container, spec }: { container: Docker.Container; spec: ContainerSpec }) {
    try {
      childLogger.info(`Starting container ${spec.name} for pod ${this.resource.metadata!.name!}`)
      await container.start()
    } catch (err) {
      this.eventBus.addEventToPodContainer(this.resourceName, spec.name, {
        type: ContainerEventType.FAILED,
        message: `Failed to start container ${spec.name} for pod ${this.resource.metadata!.name!}: ${err}`,
      })
      childLogger.error(
        { err },
        `Failed to start container for pod ${this.resource.metadata!.name!}`,
      )
      return
    }
  }

  async reconcile() {
    await this.mutex.runExclusive(async () => {
      const containersInfos = await this.docker.findContainersInfosForResource(this.resourceName)
      if (containersInfos.length > 0) {
        childLogger.error(`Pod ${this.resourceName} already has containers associated with it`)
        return
        // pod spec is immutable, error
      }
      childLogger.info(`Creating pod ${this.resource.metadata!.name!}`)
      const containers = await Promise.all(
        (this.resource.spec!.containers || []).map(async (def) => ({
          spec: def.spec,
          container: await this.createContainer(def.spec),
        })),
      )
      if (containers.some((c) => c.container == null)) {
        childLogger.error(`Pod ${this.resourceName} failed to create some containers`)
        return
      }
      childLogger.info(`Starting containers for pod ${this.resource.metadata!.name!}`)
      await Promise.all(
        containers.map((c) => this.startContainer({ container: c.container!, spec: c.spec })),
      )
    })
  }

  private async handleDockerEvent(containerName: string, event: DockerEvent) {
    childLogger.info(`Received docker event for container ${containerName}: ${event.type}`)
    if (event.type === 'start') {
      this.eventBus.addEventToPodContainer(this.resource.metadata.name, containerName, {
        type: ContainerEventType.STARTED,
        message: `Container ${containerName} has started`,
      })
    } else if (event.type === 'succeeded') {
      this.eventBus.addEventToPodContainer(this.resource.metadata.name, containerName, {
        type: ContainerEventType.SUCCEEDED,
        message: `Container ${containerName} has succeeded`,
      })
    } else if (event.type === 'failed') {
      this.eventBus.addEventToPodContainer(this.resource.metadata.name, containerName, {
        type: ContainerEventType.FAILED,
        message: `Container ${containerName} has failed`,
      })
    }
  }
}
