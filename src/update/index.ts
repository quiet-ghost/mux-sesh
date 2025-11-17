import type { Config } from '../types'
import { CURRENT_VERSION, getLatestVersion, isNewerVersion } from './version'
import { detectInstallMethod, performUpgrade } from './installation'
import { updateEvents } from './events'

function truthy(key: string): boolean {
  const value = process.env[key]?.toLowerCase()
  return value === 'true' || value === '1'
}

export async function checkAndUpdate(config: Config): Promise<void> {
  if (!(config.autoUpdate && !truthy('MUX_SESH_DISABLE_AUTOUPDATE'))) {
    return
  }

  const latest = await getLatestVersion()
  if (!latest) {
    return
  }

  if (!isNewerVersion(CURRENT_VERSION, latest)) {
    return
  }

  const method = await detectInstallMethod()
  const success = await performUpgrade(method, latest)
  if (success) {
    updateEvents.emit({ version: latest })
  }
}

export { updateEvents } from './events'
