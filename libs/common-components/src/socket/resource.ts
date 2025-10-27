import { ContainerEventType } from '../manifest/container'
import { PodEventType, PodResourceDefinition } from '../manifest/pod'
import { defineMessage } from './common'

type UpdatePodContent = {
  definition: PodResourceDefinition
}

export const EventBusUpdatePodNotification = defineMessage({
  type: 'NOTIFICATION',
  message: 'pod.update',
  content: {} as UpdatePodContent,
})

type AddEventToPodContainerNotificationContent = {
  podName: string
  containerName: string
  event: {
    type: ContainerEventType
    reason?: string
    message?: string
  }
  timestamp: string
}

export const EventBusAddEventToPodContainerNotification = defineMessage({
  type: 'NOTIFICATION',
  message: 'pod.container.add_event',
  content: {} as AddEventToPodContainerNotificationContent,
})
