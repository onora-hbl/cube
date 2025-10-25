import { ResourceDefinition } from '../manifest/common'
import { defineMessage } from './common'

type UpdateResourceContent = {
  resource: ResourceDefinition
}

export const EventBusUpdateResourceNotification = defineMessage({
  type: 'NOTIFICATION',
  message: 'resource',
  content: {} as UpdateResourceContent,
})
