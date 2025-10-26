import { Mutex } from 'async-mutex'
import logger from '../logger'
import { EventBus } from './EventBus'
import { ContainerResourceDefinition } from 'common-components/dist/manifest/common'
import { ContainerSpec } from 'common-components/dist/manifest/container'
import { DockerManager } from './DockerManager'

const childLogger = logger.child({ component: 'Reconcilier' })

export class Reconciler {
  private mutex = new Mutex()
  private retryCounts = new Map<string, number>()

  constructor(
    private resource: ContainerResourceDefinition,
    private docker: DockerManager,
    private eventBus: EventBus,
  ) {}

  public updateResource(resource: ContainerResourceDefinition) {
    this.resource = resource
  }

  async reconcile() {
    await this.mutex.runExclusive(async () => {
      const resourceName = this.resource.metadata!.name!
      const container = await this.docker.findContainerForResource(resourceName)
      if (!container) {
        await this.ensureImageThenCreate(resourceName, this.resource.spec)
        return
      }
      const info = await this.docker.inspectContainer(container)
      const currentImage = info.Config.Image
      if (currentImage !== this.resource.spec.image) {
        // this.eventBus.emitEvent({ resourceName, type: 'recreate', details: 'image changed' })
        this.eventBus.addEventToResource(resourceName, {
          type: 'STOPPING',
          reason: 'ImageChange',
          message: 'Stopping container due to image change',
        })
        await this.docker.stopAndRemove(container)
        this.eventBus.addEventToResource(resourceName, {
          type: 'STOPPED',
          reason: 'ImageChange',
          message: 'Container stopped due to image change',
        })
        await this.ensureImageThenCreate(resourceName, this.resource.spec)
        return
      }
      if (info.State?.Running !== true) {
        try {
          await this.docker.startContainer(container)
          // this.eventBus.emitEvent({ resourceName, type: 'started', details: 'container started' })
        } catch (err) {
          // this.eventBus.emitEvent({ resourceName, type: 'start_failed', details: String(err) })
        }
      }
    })
  }

  private async ensureImageThenCreate(resourceName: string, spec: ContainerSpec) {
    const image = spec.image
    if (!(await this.docker.imageExists(image))) {
      // this.eventBus.emitEvent({ resourceName, type: 'pulling', details: image })
      try {
        await this.docker.pullImage(image)
        // this.eventBus.emitEvent({ resourceName, type: 'pulled', details: image })
      } catch (err) {
        const prev = this.retryCounts.get(resourceName) ?? 0
        this.retryCounts.set(resourceName, prev + 1)
        // this.eventBus.emitEvent({ resourceName, type: 'pull_failed', details: String(err) })
        if (prev + 1 >= 3) {
          // this.eventBus.emitEvent({ resourceName, type: 'failed', details: 'max pulls reached' })
          await this.reportFailure(resourceName, 'image pull failed')
          return
        }
        const delay = Math.min(60_000, 1000 * 2 ** prev)
        setTimeout(() => this.reconcile(), delay)
        return
      }
    }
    const c = await this.docker.createAndStartContainer(resourceName, spec)
    // this.eventBus.emitEvent({ resourceName, type: 'created', details: c.id })
  }

  private async reportFailure(resourceName: string, msg: string) {
    // await this.eventBus.sendResourceStatus(resourceName, 'Failed', msg)
  }
}
