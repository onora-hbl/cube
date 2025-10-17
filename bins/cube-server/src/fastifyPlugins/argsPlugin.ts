import { FastifyPluginAsync } from 'fastify'
import { ServerMode } from '../arguments'
import fp from 'fastify-plugin'

interface ParsedOptions {
  token: string
  mode: ServerMode
  leaderHost?: string
  leaderPort?: number
}

declare module 'fastify' {
  interface FastifyInstance {
    args: ParsedOptions
  }
}

const argsPlugin: FastifyPluginAsync<{ parsedOptions: ParsedOptions }> = async (
  fastify,
  options,
) => {
  fastify.decorate('args', {
    token: options.parsedOptions.token,
    mode: options.parsedOptions.mode,
    leaderHost:
      options.parsedOptions.mode === ServerMode.LEADER
        ? undefined
        : options.parsedOptions.leaderHost,
    leaderPort:
      options.parsedOptions.mode === ServerMode.LEADER
        ? undefined
        : options.parsedOptions.leaderPort,
  })
}

export default fp(argsPlugin)
