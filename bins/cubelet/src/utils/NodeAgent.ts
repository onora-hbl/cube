import { EventBus } from './EventBus'
import logger from '../logger'
import { DockerManager } from './DockerManager'
import { PodResourceDefinition } from 'common-components/dist/manifest/pod'
import { PodReconciler } from './PodReconciler'

const childLogger = logger.child({ component: 'NodeAgent' })

export class NodeAgent {
  private podReconciliers = new Map<string, PodReconciler>()
  private docker = new DockerManager()
  constructor(private eventBus: EventBus) {
    eventBus.on('pod.update', (pod) => this.onPodUpdate(pod))
  }

  async onPodUpdate(pod: PodResourceDefinition) {
    let reconciler = this.podReconciliers.get(pod.metadata!.name!)
    if (!reconciler) {
      reconciler = new PodReconciler(pod, this.docker, this.eventBus)
      this.podReconciliers.set(pod.metadata!.name!, reconciler)
    } else {
      reconciler.updateResource(pod)
    }
    childLogger.info(`Reconciling pod ${pod.metadata!.name!}`)
    await reconciler.reconcile()
  }
}
