import { Mutex } from 'async-mutex'
import logger from '../logger'
import { EventBus } from './EventBus'
import { ContainerSpec } from 'common-components/dist/manifest/container'
import { DockerManager } from './DockerManager'
import { PodResourceDefinition } from 'common-components/dist/manifest/pod'
import Docker from 'dockerode'

const childLogger = logger.child({ component: 'PodReconciler' })

export class PodReconciler {
  private mutex = new Mutex()

  constructor(
    private resource: PodResourceDefinition,
    private docker: DockerManager,
    private eventBus: EventBus,
  ) {}

  public updateResource(resource: PodResourceDefinition) {
    this.resource = resource
    const resourceName = this.resource.metadata!.name!
    this.docker.onResourceContainerEvent(`pod/${resourceName}`, (ev, container) => {
      this.handleDockerEvent(ev, container)
    })
  }

  async createContainer(spec: ContainerSpec) {
    const image = spec.image
    if (!(await this.docker.imageExists(image))) {
      try {
        await this.docker.pullImage(image)
      } catch (err) {
        // TODO: event image_pull_failed
        return
      }
    }
    const c = await this.docker.createContainer()
    // TODO: event container_created
    c.start()
    // TODO: event container_started
  }

  async reconcile() {
    // TODO: avoid reconcile if there is no spec change
    await this.mutex.runExclusive(async () => {
      const resourceName = this.resource.metadata!.name!
      const containersInfos = await this.docker.findContainersInfosForResource(
        `pod/${resourceName}`,
      )
      if (containersInfos.length > 0) {
        // pod spec is immutable, error
      }
      for (const containerDefinition of this.resource.spec!.containers || []) {
        await this.createContainer(containerDefinition.spec)
      }
    })
  }

  private async handleDockerEvent(ev: any, container: Docker.Container) {
    // update containers status based on docker event
    // update pod status on containers statuses
  }
}
