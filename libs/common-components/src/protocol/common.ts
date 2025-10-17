import type { FastifySchema } from 'fastify'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export const BaseErrors = ['BAD_REQUEST', 'INTERNAL_ERROR'] as const
export type BaseErrorCode = (typeof BaseErrors)[number]

export function defineEndpoint<
  M extends HttpMethod,
  U extends string,
  Req,
  Res,
  SpecificErrors extends string,
>(def: {
  method: M
  url: U
  requestBody: Req
  responseBody: Res
  errors: readonly SpecificErrors[]
  schema?: FastifySchema
}) {
  return def
}

export type InferRequest<T> = T extends { requestBody: infer R } ? R : never
export type InferResponse<T> = T extends { responseBody: infer R } ? R : never
export type InferErrorCode<T> = T extends { errors: readonly (infer E)[] }
  ? E | BaseErrorCode
  : never
export type InferError<T> = { code: InferErrorCode<T>; message: string }
