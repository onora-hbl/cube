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
