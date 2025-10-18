import { Config, printHelp } from './arguments'
import { applyCmd } from './commands/apply'
import { nodesCmd } from './commands/nodes'

export async function executeCommand(args: string[], config: Config) {
  if (args.length === 0) {
    console.log('No command provided')
    printHelp()
    process.exit(1)
  }
  const cmd = args[0]
  switch (cmd) {
    case 'nodes':
      await nodesCmd(args.slice(1), config)
      break
    case 'apply':
      await applyCmd(args.slice(1), config)
      break
    default:
      console.log(`Unknown command: ${cmd}`)
      printHelp()
      process.exit(1)
  }
}
