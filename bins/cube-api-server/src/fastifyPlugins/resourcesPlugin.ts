import { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { EventEmitter } from 'stream'
import fp from 'fastify-plugin'
import logger from '../logger'
import { PodEventType, PodSpec, PodState, PodStatus } from 'common-components/src/manifest/pod'
import { PodResourceDefinition } from 'common-components/dist/manifest/pod'
import { ResourceMetadataDefinition, ResourceStatus } from 'common-components/src/manifest/common'
import { ContainerEventType } from 'common-components/src/manifest/container'
import { ContainerState } from 'common-components/dist/manifest/container'
import { Mutex } from 'async-mutex'

const childLogger = logger.child({ plugin: 'resources' })

type PodEventBase = {
  uuid: string
  reason?: string
  message?: string
  timestamp: Date
}

type PodEvent =
  | (PodEventBase & {
      type: PodEventType
      containerName?: undefined
    })
  | (PodEventBase & {
      type: ContainerEventType
      containerName: string
    })

type PodEventRecord = {
  uuid: string
  pod_uuid: string
  event_type: string
  container_name?: string
  reason?: string
  message?: string
  timestamp: string
}

export type Pod = {
  uuid: string
  nodeUuid?: string
  metadata: ResourceMetadataDefinition
  spec: PodSpec
  status: PodStatus
  events: PodEvent[]
}

type PodRecord = {
  uuid: string
  node_uuid?: string
  metadata_json: string
  spec_json: string
  status_json: string
}

class ResourceStore {
  private emitter = new EventEmitter()
  private fastify: FastifyInstance

  private podsByName: Map<string, Pod> = new Map()

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  private async loadPods() {
    const podEventRows = this.fastify.db
      .prepare(
        `SELECT uuid, pod_uuid, event_type, reason, message, timestamp, container_name FROM pods_events;`,
      )
      .all() as PodEventRecord[]
    const podEventsByPodUuid: Map<string, PodEvent[]> = new Map()
    for (const row of podEventRows) {
      const event: PodEvent = row.container_name
        ? {
            uuid: row.uuid,
            type: row.event_type as ContainerEventType,
            reason: row.reason,
            message: row.message,
            timestamp: new Date(row.timestamp),
            containerName: row.container_name,
          }
        : {
            uuid: row.uuid,
            type: row.event_type as PodEventType,
            reason: row.reason,
            message: row.message,
            timestamp: new Date(row.timestamp),
          }
      if (!podEventsByPodUuid.has(row.pod_uuid)) {
        podEventsByPodUuid.set(row.pod_uuid, [])
      }
      podEventsByPodUuid.get(row.pod_uuid)!.push(event)
    }

    const podRows = this.fastify.db
      .prepare(`SELECT uuid, node_uuid, metadata_json, spec_json, status_json FROM pods;`)
      .all() as PodRecord[]
    childLogger.debug(`Loading ${podRows.length} pods from database`)
    for (const row of podRows) {
      const pod: Pod = {
        uuid: row.uuid,
        nodeUuid: row.node_uuid || undefined,
        metadata: JSON.parse(row.metadata_json),
        spec: JSON.parse(row.spec_json),
        status: JSON.parse(row.status_json),
        events: podEventsByPodUuid.get(row.uuid) || [],
      }
      this.podsByName.set(pod.metadata.name, pod)
    }
  }

  public async loadAll() {
    await Promise.all([this.loadPods()])
  }

  private addEventToPod(pod: Pod, eventType: PodEventType, message?: string, reason?: string) {
    this.addEventToPodAtDate(pod, eventType, new Date(), message, reason)
  }

  private addEventToPodAtDate(
    pod: Pod,
    eventType: PodEventType,
    date: Date,
    message?: string,
    reason?: string,
  ) {
    const eventUuid = crypto.randomUUID()
    this.fastify.db
      .prepare(
        `INSERT INTO pods_events (uuid, pod_uuid, event_type, reason, message, timestamp) VALUES (?, ?, ?, ?, ?, ?);`,
      )
      .run(eventUuid, pod.uuid, eventType, reason || null, message || null, date.toISOString())
    const event: PodEvent = {
      uuid: eventUuid,
      type: eventType,
      reason,
      message,
      timestamp: date,
    }
    pod.events.push(event)
  }

  private addEventToContainerInPod(
    pod: Pod,
    containerName: string,
    eventType: ContainerEventType,
    message?: string,
    reason?: string,
  ) {
    this.addEventToContainerInPodAtDate(pod, containerName, eventType, new Date(), message, reason)
  }

  public addEventToContainerInPodAtDate(
    pod: Pod,
    containerName: string,
    eventType: ContainerEventType,
    date: Date,
    message?: string,
    reason?: string,
  ) {
    const eventUuid = crypto.randomUUID()
    this.fastify.db
      .prepare(
        `INSERT INTO pods_events (uuid, pod_uuid, event_type, container_name, reason, message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      )
      .run(
        eventUuid,
        pod.uuid,
        eventType,
        containerName,
        reason || null,
        message || null,
        date.toISOString(),
      )
    const event: PodEvent = {
      uuid: eventUuid,
      type: eventType,
      containerName,
      reason,
      message,
      timestamp: date,
    }
    pod.events.push(event)
  }

  private updateStatusMutex = new Mutex()

  public async updatePodContainerStatusBasedOnEvent(
    podName: string,
    containerName: string,
    event: ContainerEventType,
    date: Date,
  ) {
    await this.updateStatusMutex.runExclusive(async () => {
      const pod = this.getPodByName(podName)
      if (pod == null) {
        throw new Error(`Pod with name ${podName} not found`)
      }
      let containerStatuses = { ...pod.status.containerStatuses }
      switch (event) {
        case ContainerEventType.IMAGE_PULL_STARTED:
          containerStatuses[containerName] = { state: ContainerState.PULLING }
          break
        case ContainerEventType.IMAGE_ALREADY_PRESENT:
        case ContainerEventType.IMAGE_PULL_SUCCEEDED:
          containerStatuses[containerName] = { state: ContainerState.CREATING }
          break
        case ContainerEventType.IMAGE_PULL_FAILED:
          containerStatuses[containerName] = { state: ContainerState.PULLING_ERROR }
          break
        case ContainerEventType.CREATED:
          containerStatuses[containerName] = { state: ContainerState.CREATED }
          break
        case ContainerEventType.STARTED:
          containerStatuses[containerName] = { state: ContainerState.RUNNING }
          break
        case ContainerEventType.SUCCEEDED:
          containerStatuses[containerName] = { state: ContainerState.SUCCEEDED }
          break
        case ContainerEventType.FAILED:
          containerStatuses[containerName] = { state: ContainerState.CRASH }
          break
        case ContainerEventType.DELETED:
          containerStatuses[containerName] = { state: ContainerState.DELETING }
          break
      }

      const allContainersCreated = Object.values(containerStatuses).every(
        (status) => status.state === ContainerState.CREATED,
      )
      if (allContainersCreated && pod.status.state === PodState.CREATING) {
        containerStatuses = Object.fromEntries(
          Object.entries(containerStatuses).map(([name, status]) => [
            name,
            { state: ContainerState.STARTING },
          ]),
        )
        this.addEventToPodAtDate(
          pod,
          PodEventType.CREATED,
          date,
          `All containers in pod are created`,
        )
        pod.status.state = PodState.STARTING
      }

      const allContainersRunning = Object.values(containerStatuses).every(
        (status) => status.state === ContainerState.RUNNING,
      )
      if (allContainersRunning && pod.status.state === PodState.STARTING) {
        this.addEventToPodAtDate(
          pod,
          PodEventType.RUNNING,
          date,
          `All containers in pod are running`,
        )
        pod.status.state = PodState.RUNNING
      }

      const allContainersSucceeded = Object.values(containerStatuses).every(
        (status) => status.state === ContainerState.SUCCEEDED,
      )
      if (allContainersSucceeded && pod.status.state === PodState.RUNNING) {
        this.addEventToPodAtDate(
          pod,
          PodEventType.DELETED,
          date,
          `All containers in pod have succeeded`,
        )
        pod.status.state = PodState.SUCCEEDED
      }

      const hasAnyContainerCrashed = Object.values(containerStatuses).some(
        (status) =>
          status.state === ContainerState.CRASH || status.state === ContainerState.CRASH_LOOP,
      )
      if (hasAnyContainerCrashed && pod.status.state === PodState.RUNNING) {
        this.addEventToPodAtDate(
          pod,
          PodEventType.CRASHED,
          date,
          `One or more containers in pod have crashed`,
        )
        pod.status.state = PodState.FAILED
      }

      const newStatus: PodStatus = {
        ...pod.status,
        containerStatuses,
      }
      this.fastify.db
        .prepare(`UPDATE pods SET status_json = ? WHERE uuid = ?;`)
        .run(JSON.stringify(newStatus), pod.uuid)
      pod.status = newStatus
    })
  }

  public async registerNewPod(pod: PodResourceDefinition, uuid: string) {
    this.fastify.db
      .prepare(
        `INSERT INTO pods (uuid, metadata_json, spec_json, status_json) VALUES (?, ?, ?, ?);`,
      )
      .run(uuid, JSON.stringify(pod.metadata), JSON.stringify(pod.spec), JSON.stringify(pod.status))
    const newPod: Pod = {
      uuid,
      metadata: {
        name: pod.metadata.name,
        labels: pod.metadata.labels,
        resourceVersion: pod.metadata.resourceVersion,
        generation: pod.metadata.generation,
        creationTimestamp: pod.metadata.creationTimestamp,
      },
      spec: pod.spec,
      status: pod.status,
      events: [],
    }
    this.addEventToPod(
      newPod,
      PodEventType.REGISTERED,
      'Pod registered',
      `Pod ${pod.metadata.name} has been registered.`,
    )
    this.podsByName.set(newPod.metadata.name, newPod)
    this.emitter.emit('pod.update', newPod)
  }

  public updatePodNode(uuid: string, nodeUuid: string | undefined) {
    const pod = this.getPodByUuid(uuid)
    if (!pod) {
      throw new Error(`Pod with UUID ${uuid} not found`)
    }
    const status = { ...pod.status }
    status.state = nodeUuid != null ? PodState.CREATING : PodState.SCHEDULING
    this.fastify.db
      .prepare(`UPDATE pods SET node_uuid = ?, status_json = ? WHERE uuid = ?;`)
      .run(nodeUuid || null, JSON.stringify(status), uuid)
    if (nodeUuid != null) {
      this.addEventToPod(
        pod,
        PodEventType.SCHEDULED,
        pod.nodeUuid == null ? 'Pod scheduled' : 'Pod rescheduled',
        pod.nodeUuid == null
          ? `Pod ${pod.metadata.name} has been scheduled to node ${nodeUuid}.`
          : `Pod ${pod.metadata.name} has been rescheduled to node ${nodeUuid}.`,
      )
    } else {
      this.addEventToPod(
        pod,
        PodEventType.UNSCHEDULED,
        'Pod unscheduled',
        `Pod ${pod.metadata.name} has been unscheduled.`,
      )
    }
    pod.status = status
    pod.nodeUuid = nodeUuid
    this.emitter.emit('pod.update', pod)
  }

  public getAllPods(): Pod[] {
    return Array.from(this.podsByName.values())
  }
  public getPodByName(name: string): Pod | undefined {
    return this.podsByName.get(name)
  }
  public getPodByUuid(uuid: string): Pod | undefined {
    return Array.from(this.podsByName.values()).find((pod) => pod.uuid === uuid)
  }

  public on(event: 'pod.update', listener: (pod: Pod) => void) {
    this.emitter.on(event, listener)
  }

  public [Symbol.dispose]() {
    this.emitter.removeAllListeners()
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    resourceStore: ResourceStore
  }
}

const resourcesPlugin: FastifyPluginAsync = async (fastify) => {
  const resourceStore = new ResourceStore(fastify)
  fastify.decorate('resourceStore', resourceStore)

  fastify.addHook('onClose', async () => {
    resourceStore[Symbol.dispose]()
  })

  await resourceStore.loadAll()
}

export default fp(resourcesPlugin)
