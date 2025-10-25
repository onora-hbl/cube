export function defineMessage<M extends string, Con, Res>(
  def:
    | {
        type: 'NOTIFICATION'
        message: M
        content: Con
      }
    | {
        type: 'REQUEST'
        message: M
        content: Con
        response: Res
      },
) {
  return {
    ...def,
  }
}

export type InferMessageContent<T> = T extends { content: infer C } ? C : never
export type InferMessageResponse<T> = T extends { response: infer R } ? R : never

export type ErrorNotificationCodes = 'SERVER_SHUTTING_DOWN' | 'MISSING_HEARTBEAT'

interface ErrorNotificationContent {
  code: ErrorNotificationCodes
  message: string
}

export const EventBusErrorNotification = defineMessage({
  type: 'NOTIFICATION',
  message: 'error',
  content: {} as ErrorNotificationContent,
})
