import { ResourceDefinition } from 'common-components'
import { EventBus } from './EventBus'
import logger from '../logger'
import { DockerManager } from './DockerManager'
import { Reconciler } from './Reconciler'

const childLogger = logger.child({ component: 'NodeAgent' })

export class NodeAgent {
  private reconcilers = new Map<string, Reconciler>()
  constructor(
    private docker: DockerManager,
    private eventBus: EventBus,
  ) {
    eventBus.on('resource', (res) => this.onResourceUpdated(res))
  }

  async initialize(initialResources: ResourceDefinition[]) {
    for (const res of initialResources) {
      this.onResourceUpdated(res)
    }
  }

  async onResourceUpdated(resource: ResourceDefinition) {
    if (resource.type !== 'container') {
      return
    }
    let reconciler = this.reconcilers.get(resource.metadata!.name!)
    if (!reconciler) {
      reconciler = new Reconciler(resource, this.docker, this.eventBus)
      this.reconcilers.set(resource.metadata!.name!, reconciler)
    } else {
      reconciler.updateResource(resource)
    }
    await reconciler.reconcile()
  }

  private async handleDockerEvent(ev: any) {
    const labels = ev.Actor?.Attributes || {}
    const resourceName = labels['cube.resourceName']
    if (resourceName) {
      // this.eventBus.emitEvent({ resourceName, type: `docker.${ev.Action}`, details: JSON.stringify(ev) })
      const reconciler = this.reconcilers.get(resourceName)
      if (reconciler) {
        setTimeout(() => reconciler.reconcile(), 10)
      }
    }
  }
}
