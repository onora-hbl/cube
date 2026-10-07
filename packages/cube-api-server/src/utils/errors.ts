import type { ResourceKind } from 'cube-types'
import type { FastifyReply } from 'fastify'

export class CubeError extends Error {
  constructor(
    private httpCode: number,
    private code: string,
    private text: string,
  ) {
    super(text)
  }

  writeReply(res: FastifyReply): FastifyReply {
    return res.code(this.httpCode).send({
      code: this.code,
      message: this.text,
    })
  }
}

export class InvalidPatchError extends CubeError {
  constructor(message: string) {
    super(422, 'INVALID_PATCH', message)
  }
}

export class ResourceAlreadyExistsError extends CubeError {
  constructor(kind: ResourceKind, name: string) {
    super(409, 'RESOURCE_ALREADY_EXISTS', `Resource of kind "${kind}" with name "${name}" already exists`)
  }
}

export class NotAuthorizedError extends CubeError {
  constructor(message: string) {
    super(401, 'NOT_AUTHORIZED', message)
  }
}

export class ForbiddenError extends CubeError {
  constructor(message: string) {
    super(403, 'FORBIDDEN', message)
  }
}

export class ResourceNotFoundError extends CubeError {
  constructor(kind: string, name: string) {
    super(404, 'RESOURCE_NOT_FOUND', `Resource of kind "${kind}" with name "${name}" not found`)
  }
}

export class InvalidFieldSelector extends CubeError {
  constructor(message: string) {
    super(400, 'INVALID_FIELD_SELECTOR', message)
  }
}
