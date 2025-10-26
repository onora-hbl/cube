import { ContainerSpec } from 'common-components/dist/manifest/container'
import Docker from 'dockerode'
const docker = new Docker({ socketPath: '/var/run/docker.sock' })

export class DockerManager {
  async findContainerForResource(resourceName: string) {
    const filters = { label: [`cube.resourceName=${resourceName}`] }
    const list = await docker.listContainers({ all: true, filters })
    if (list.length === 0) return null
    // take the first (should usually be one container per resource for now)
    const info = list[0]
    return docker.getContainer(info.Id)
  }

  async inspectContainer(container: Docker.Container) {
    return container.inspect()
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

  async createAndStartContainer(resourceName: string, spec: ContainerSpec) {
    const env = spec.env ? Object.entries(spec.env).map(([k, v]) => `${k}=${v}`) : undefined
    const labels = {
      'cube.resourceName': resourceName,
      'cube.resourceType': 'container',
    }
    const container = await docker.createContainer({
      Image: spec.image,
      name: `${resourceName}__${spec.name}`,
      Env: env,
      Labels: labels,
      HostConfig: {
        NetworkMode: 'bridge', // or custom network
      },
    })
    await container.start()
    return container
  }

  async startContainer(container: Docker.Container) {
    try {
      await container.start()
    } catch (e) {
      /* handle */
    }
  }

  async stopAndRemove(container: Docker.Container) {
    try {
      await container.stop({ t: 10 })
    } catch (e) {}
    try {
      await container.remove({ force: true })
    } catch (e) {}
  }
}
