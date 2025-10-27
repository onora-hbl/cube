import { ContainerSpec } from 'common-components/dist/manifest/container'
import Docker from 'dockerode'
import { EventEmitter } from 'stream'
import logger from '../logger'

const childLogger = logger.child({ component: 'DockerManager' })

const docker = new Docker({ socketPath: '/var/run/docker.sock' })

export enum DockerEventType {
  START = 'start',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

export type DockerEvent =
  | {
      type: DockerEventType.START
    }
  | {
      type: DockerEventType.SUCCEEDED
    }
  | {
      type: DockerEventType.FAILED
      exitCode: number
    }

export class DockerManager {
  private eventEmitter = new EventEmitter()
  private eventStream?: NodeJS.ReadableStream
  private reconnectTimer?: NodeJS.Timeout

  constructor() {
    this.connectEventStream()
  }

  async findContainersInfosForResource(resourceName: string) {
    const filters = { label: [`cube.resourceName=${resourceName}`] }
    return await docker.listContainers({ all: true, filters })
  }

  async listImages() {
    return docker.listImages()
  }

  async imageExists(image: string) {
    const images = await docker.listImages({ filters: { reference: [image] } as any })
    return images.length > 0
  }

  async pullImage(image: string, onProgress?: (msg: any) => void) {
    return new Promise<void>((resolve, reject) => {
      docker.pull(image, (err: any, stream: any) => {
        if (err) return reject(err)
        docker.modem.followProgress(
          stream,
          (err2: any, out: any) => (err2 ? reject(err2) : resolve()),
          onProgress,
        )
      })
    })
  }

  async createContainer(resourceName: string, spec: ContainerSpec) {
    const env = spec.env ? Object.entries(spec.env).map(([k, v]) => `${k}=${v}`) : undefined
    const labels = {
      'cube.resourceType': 'pod',
      'cube.resourceName': resourceName,
      'cube.pod.containerName': spec.name,
    }
    const container = await docker.createContainer({
      Image: spec.image,
      name: `${resourceName.replace('/', '_')}__${spec.name}`,
      Env: env,
      Labels: labels,
      HostConfig: {
        NetworkMode: 'bridge',
      },
    })
    return container
  }

  onResourceContainerEvent(
    resourceName: string,
    handler: (containerName: string, event: DockerEvent) => void,
  ) {
    this.eventEmitter.on('docker.event', async (event) => {
      // console.log(event)
      if (!event.Actor?.Attributes) return
      const labels = event.Actor.Attributes
      const hasLabel = Object.entries(labels).some(
        ([key, val]) => key === 'cube.resourceName' && val === resourceName,
      )
      if (!hasLabel) return
      const containerName = labels['cube.pod.containerName']
      if (!containerName) {
        childLogger.error(`Docker event for resource ${resourceName} missing container name label`)
        return
      }
      const status = event.status
      if (status === 'start') {
        handler(containerName, { type: DockerEventType.START })
        return
      } else if (status === 'die') {
        const exitCode = parseInt(event.Actor?.Attributes?.exitCode, 10)
        if (exitCode === 0) {
          handler(containerName, { type: DockerEventType.SUCCEEDED })
          return
        } else {
          handler(containerName, { type: DockerEventType.FAILED, exitCode })
          return
        }
      }
    })
  }

  private async connectEventStream() {
    try {
      this.eventStream = await docker.getEvents()
      this.eventStream.on('data', (chunk) => {
        try {
          const event = JSON.parse(chunk.toString())
          this.eventEmitter.emit('docker.event', event)
        } catch (err) {
          childLogger.warn({ err }, 'Malformed Docker event')
        }
      })
      this.eventStream.on('end', () => this.scheduleReconnect())
      this.eventStream.on('error', () => this.scheduleReconnect())

      childLogger.info('Connected to Docker event stream')
    } catch (err) {
      childLogger.error({ err }, 'Failed to connect to Docker event stream, retrying...')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connectEventStream(), 5000)
  }

  [Symbol.dispose]() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    this.eventEmitter.removeAllListeners()
  }
}
