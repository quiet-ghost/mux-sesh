import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import packageJson from '../../package.json'
import { buildVersion } from './build'

export const CURRENT_VERSION = buildVersion() ?? packageJson.version
const PACKAGE_NAME = packageJson.name

const decodeRegistryLatest = Schema.decodeUnknownOption(Schema.Struct({ version: Schema.String }))

export async function getLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data: unknown = await response.json()

    return Option.getOrNull(Option.map(decodeRegistryLatest(data), latest => latest.version))
  } catch (error) {
    console.error('Failed to check for updates:', error)

    return null
  }
}

export function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split('.').map(Number)
  const latestParts = latest.split('.').map(Number)

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const curr = currentParts[i] || 0
    const lat = latestParts[i] || 0

    if (lat > curr) return true

    if (lat < curr) return false
  }

  return false
}
