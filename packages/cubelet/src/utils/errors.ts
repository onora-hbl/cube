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
