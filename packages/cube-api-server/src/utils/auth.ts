import { CubeRole } from 'cube-types'

export function getRoleFromToken(token: string): CubeRole | null {
  if (token === 'cube-cli-token') {
    return CubeRole.CLI
  }

  if (token === 'cube-cubelet-token') {
    return CubeRole.CUBELET
  }

  return null
}
