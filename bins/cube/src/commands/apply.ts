import { Config } from '../arguments'
import fs from 'fs'
import Ajv from 'ajv'
import { ResourceDefinition, ResourceSchema } from 'common-components'

const ajv = new Ajv()

class ManifestError extends Error {}

export async function applyResource(resource: ResourceDefinition, config: Config) {
  console.log(
    `Applying resource of type ${resource.type} with name ${resource.metadata?.name || '<unnamed>'}`,
  )
}

export async function applyResourcesList(jsonData: any[], config: Config) {
  if (!Array.isArray(jsonData)) {
    throw new ManifestError('Invalid JSON format. Expected an array of objects.')
  }
  for (const resource of jsonData) {
    if (typeof resource !== 'object' || resource === null) {
      throw new ManifestError('Each resource must be a non-null object.')
    }
    const valid = ajv.validate(ResourceSchema, resource)
    if (!valid) {
      throw new ManifestError(`Resource validation failed: ${ajv.errorsText()}`)
    }
    await applyResource(resource as ResourceDefinition, config)
  }
}

export async function applyCmd(args: string[], config: Config) {
  if (args.length != 1) {
    console.error('Please provide exactly one argument: the path to the JSON file.')
    process.exit(1)
  }
  const filePath = args[0].trim()
  if (filePath.length < 6 || !filePath.endsWith('.json')) {
    console.error('Invalid file path. Please provide a valid JSON file.')
    process.exit(1)
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  try {
    const jsonData = JSON.parse(fileContent)
    await applyResourcesList(jsonData, config)
  } catch (e) {
    if (e instanceof ManifestError) {
      console.error(`Manifest error: ${e.message}`)
      process.exit(1)
    } else {
      console.error(`Failed to parse JSON file: ${(e as Error).message}`)
      process.exit(1)
    }
  }
}
