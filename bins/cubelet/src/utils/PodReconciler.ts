import { Mutex } from 'async-mutex'
import logger from '../logger'
import { EventBus } from './EventBus'
import { ContainerSpec } from 'common-components/dist/manifest/container'
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
    this.docker.onResourceContainerEvent(this.resourceName, this.handleDockerEvent)
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
        // update container state: pulling_image
        // create pod event: container X pulling_image
        await this.docker.pullImage(image)
        childLogger.info(
          `Successfully pulled image ${image} for pod ${this.resource.metadata!.name!}`,
        )
        // create pod event: container X image_pulled
      } catch (err) {
        childLogger.error(
          { err },
          `Failed to pull image ${image} for pod ${this.resource.metadata!.name!}`,
        )
        // update container state: image_pull_failed
        // create pod event: container X image_pull_failed
        return
      }
    } else {
      // create pod event: container X image_already_present
    }
    // update container state: creating
    // create pod event: container X creating
    try {
      childLogger.info(`Creating container for pod ${this.resource.metadata!.name!}`)
      const container = await this.docker.createContainer(this.resourceName, spec)
      childLogger.info(`Successfully created container for pod ${this.resource.metadata!.name!}`)
      return container
    } catch (err) {
      childLogger.error(
        { err },
        `Failed to create container for pod ${this.resource.metadata!.name!}`,
      )
      // update container state: creation_failed
      // create pod event: container X creation_failed
      return
    }
    // update container state: created
    // create pod event: container X created
  }

  async startContainer({ container, spec }: { container: Docker.Container; spec: ContainerSpec }) {
    try {
      // update container state: starting
      // create pod event: container X starting
      childLogger.info(`Starting container ${spec.name} for pod ${this.resource.metadata!.name!}`)
      await container.start()
    } catch (err) {
      // update container state: start_failed
      // create pod event: container X start_failed
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
      // create pod event: pod creating
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
      // create pod event: pod starting
      await Promise.all(
        containers.map((c) => this.startContainer({ container: c.container!, spec: c.spec })),
      )
    })
  }

  private async handleDockerEvent(containerName: string, event: DockerEvent) {
    // if container is running, update container state to running (create pod event: container X running)
    // if container exited, update container state to succeeded or failed based on exit code (create pod event: container X exited)
    // if container crashed, update container state to failed (create pod event: container X crashed)
    childLogger.info(`Received docker event for container ${containerName}: ${event.type}`)
  }
}
