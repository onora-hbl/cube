import { type FastifySchema } from 'fastify'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export const BaseErrors = ['BAD_REQUEST', 'INTERNAL_ERROR'] as const
export type BaseErrorCode = (typeof BaseErrors)[number]

type UrlParamDefinition =
  | { type: 'string'; validator?: (value: string) => boolean }
  | { type: 'number'; validator?: (value: number) => boolean }

type UrlParamsDefinition = Record<string, UrlParamDefinition>

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }

  get validation() {
    return true
  }
}

export function defineEndpoint<
  M extends HttpMethod,
  U extends string,
  P extends UrlParamsDefinition | undefined,
  Req,
  Res,
  SpecificErrors extends string,
>(def: {
  method: M
  url: U
  urlParams?: P
  requestBody: Req
  responseBody: Res
  errors: readonly SpecificErrors[]
  schema?: FastifySchema
}) {
  type InferredParams = P extends UrlParamsDefinition
    ? { [K in keyof P]: P[K]['type'] extends 'number' ? number : string }
    : undefined

  function getUrlParams(raw: unknown): InferredParams {
    const rawTyped = raw as Record<string, string>
    if (!def.urlParams) return undefined as InferredParams
    const parsed: any = {}
    for (const key in def.urlParams) {
      const schema = def.urlParams[key]
      let value: any = rawTyped[key]
      if (schema.type === 'number') {
        value = Number(value)
        if (isNaN(value)) throw new ValidationError(`Invalid number for param "${key}"`)
      }
      if (schema.validator && !schema.validator(value as never)) {
        throw new ValidationError(`Validation failed for param "${key}"`)
      }
      parsed[key] = value
    }
    return parsed as InferredParams
  }

  function formatUrl(params: InferredParams): string {
    return def.url.replace(/:([a-zA-Z_]+)/g, (_, key) => {
      const value = (params as any)[key]
      if (value === undefined) throw new Error(`Missing param "${key}"`)
      return String(value)
    })
  }

  return {
    ...def,
    getUrlParams,
    formatUrl,
  }
}

export type InferRequest<T> = T extends { requestBody: infer R } ? R : never
export type InferResponse<T> = T extends { responseBody: infer R } ? R : never
export type InferErrorCode<T> = T extends { errors: readonly (infer E)[] }
  ? E | BaseErrorCode
  : never
export type InferError<T> = { code: InferErrorCode<T>; message: string }
