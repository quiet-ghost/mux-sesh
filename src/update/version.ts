import packageJson from '../../package.json'

export const CURRENT_VERSION = packageJson.version
const PACKAGE_NAME = packageJson.name

export async function getLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()

    return data.version
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
