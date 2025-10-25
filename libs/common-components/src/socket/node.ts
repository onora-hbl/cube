import { ResourceDefinition } from '../manifest/common'
import { defineMessage } from './common'

type SubscribeRequestContent = {
  name: string
}

type SubscribeResponseContent = {
  success: boolean
  message?: string
}

export const EventBusSubscribeRequest = defineMessage({
  type: 'REQUEST',
  message: 'subscribe',
  content: {} as SubscribeRequestContent,
  response: {} as SubscribeResponseContent,
})

type InitializatedContent = {
  resources: ResourceDefinition[]
}

export const EventBusInitializedNotification = defineMessage({
  type: 'NOTIFICATION',
  message: 'initialized',
  content: {} as InitializatedContent,
})
