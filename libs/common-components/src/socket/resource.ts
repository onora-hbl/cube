import { PodResourceDefinition } from '../manifest/pod'
import { defineMessage } from './common'

type UpdatePodContent = {
  definition: PodResourceDefinition
}

export const EventBusUpdatePodNotification = defineMessage({
  type: 'NOTIFICATION',
  message: 'pod.update',
  content: {} as UpdatePodContent,
})
