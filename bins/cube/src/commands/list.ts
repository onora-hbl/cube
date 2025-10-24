import { ApiServerApiListEndpoint, InferResponse } from 'common-components'
import { Config } from '../arguments'
import { cleanColumnsIfAllEmpty, printTable } from '../utils/table'

export async function listCmd(args: string[], config: Config) {
  const type = args[0]
  if (!type) {
    console.error('Resource type is required')
    process.exit(1)
  }
  const response = await fetch(
    `${config.apiServerUrl}${ApiServerApiListEndpoint.formatUrl({ type })}`,
    {
      method: ApiServerApiListEndpoint.method,
    },
  )
  const responseData = (await response.json()) as InferResponse<typeof ApiServerApiListEndpoint>
  const overviews = responseData.resourcesOverview
  printTable(cleanColumnsIfAllEmpty(overviews))
}
