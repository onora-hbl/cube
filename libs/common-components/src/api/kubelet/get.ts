import { allResourceTypes, ResourceType } from '../../manifest/common'
import { defineEndpoint } from '../common'
import { ContainerResource } from '../../manifest/container'
import { PodResource } from '../../manifest/pod'

export enum ContainerStatus {
  SCHEDULING = 'scheduling',
  PULLING = 'pulling',
  PULLING_ERROR_LOOP = 'pulling_error_loop',
  STARTING = 'starting',
  CRASH = 'crash',
  CRASH_LOOP = 'crash_loop',
  RUNNING = 'running',
  FINISHED = 'finished',
  DELETING = 'deleting',
}

type ResourceOverview = {
  name: string
  overview: Record<string, string>
}

interface CubeGetResponse {
  resources: ResourceOverview[]
}

export const CubeletApiGetEndpoint = defineEndpoint({
  method: 'GET',
  url: '/api/get/:type',
  urlParams: {
    type: {
      type: 'string',
      validator: (value: string) => allResourceTypes.includes(value as ResourceType),
    },
  },
  requestBody: undefined,
  responseBody: {} as CubeGetResponse,
  errors: [] as const,
})
