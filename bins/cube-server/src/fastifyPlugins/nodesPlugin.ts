import { ServerMode } from 'common-components'
import fp from 'fastify-plugin'
import logger from '../logger'

export type Node = {
  name: string
  host: string
  type: ServerMode
}

declare module 'fastify' {
  interface FastifyInstance {
    knownNodes: Node[]
    registerNode: (node: Node) => void
  }
}

const childLogger = logger.child({ plugin: 'nodesPlugin' })

const nodesPlugin = async (fastify: any) => {
  const nodes = fastify.db
    .prepare(
      `
SELECT name, host, type FROM node;
`,
    )
    .all()

  childLogger.info(`Loaded ${nodes.length} known nodes from database`)

  fastify.decorate('knownNodes', nodes)

  fastify.decorate('registerNode', (node: Node) => {
    const exists = fastify.knownNodes.find((n: Node) => n.name === node.name)
    if (exists) {
      throw new Error(`Node with name ${node.name} is already registered`)
    }

    fastify.db
      .prepare(
        `
INSERT INTO node (name, host, type) VALUES (?, ?, ?);
`,
      )
      .run(node.name, node.host, node.type)

    fastify.knownNodes.push(node)
    childLogger.info(`Registered new node: ${node.name} at ${node.host} (${node.type})`)
  })
}

export default fp(nodesPlugin)
