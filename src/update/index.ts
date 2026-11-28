import type { Config } from '../config/config-model'
import type { UpdateEvent } from './update-event'
import { CURRENT_VERSION, getLatestVersion, isNewerVersion } from './version'
import {
  canAutoUpdate,
  detectInstallMethod,
  getInstalledVersion,
  performUpgrade,
  upgradeCommand,
} from './installation'
import { updateEvents } from './events'

interface UpdateDependencies {
  getLatestVersion: typeof getLatestVersion
  isNewerVersion: typeof isNewerVersion
  detectInstallMethod: typeof detectInstallMethod
  canAutoUpdate: typeof canAutoUpdate
  getInstalledVersion: typeof getInstalledVersion
  performUpgrade: typeof performUpgrade
  emit: typeof updateEvents.emit
}

const defaultDependencies: UpdateDependencies = {
  getLatestVersion,
  isNewerVersion,
  detectInstallMethod,
  canAutoUpdate,
  getInstalledVersion,
  performUpgrade,
  emit: updateEvents.emit.bind(updateEvents),
}

function truthy(key: string): boolean {
  const value = process.env[key]?.toLowerCase()

  return value === 'true' || value === '1'
}

export async function checkAndUpdate(
  config: Config,
  dependencies: Partial<UpdateDependencies> = {}
): Promise<void> {
  const resolvedDependencies = {
    ...defaultDependencies,
    ...dependencies,
  }

  if (!(config.autoUpdate && !truthy('MUX_SESH_DISABLE_AUTOUPDATE'))) {
    return
  }

  const latest = await resolvedDependencies.getLatestVersion()

  if (!latest) {
    return
  }

  if (!resolvedDependencies.isNewerVersion(CURRENT_VERSION, latest)) {
    return
  }

  const method = await resolvedDependencies.detectInstallMethod()

  if (!resolvedDependencies.canAutoUpdate(method)) {
    resolvedDependencies.emit({
      kind: 'available',
      currentVersion: CURRENT_VERSION,
      version: latest,
      installMethod: method,
    })

    return
  }

  const success = await resolvedDependencies.performUpgrade(method, latest)
  const installedVersion = success ? await resolvedDependencies.getInstalledVersion() : null

  if (success && installedVersion === latest) {
    resolvedDependencies.emit({
      kind: 'updated',
      currentVersion: CURRENT_VERSION,
      version: latest,
      installMethod: method,
    })

    return
  }

  resolvedDependencies.emit({
    kind: 'failed',
    currentVersion: CURRENT_VERSION,
    version: latest,
    installMethod: method,
  })
}

export interface UpdateNotice {
  readonly kind: 'info' | 'success' | 'error'
  readonly message: string
}

// What the status line says about a background update check.
export function describeUpdateEvent(event: UpdateEvent): UpdateNotice {
  switch (event.kind) {
    case 'updated':
      return {
        kind: 'success',
        message: `Updated in background to v${event.version}. Restart mux-sesh to use it.`,
      }
    case 'available': {
      const command = upgradeCommand(event.installMethod)

      return {
        kind: 'info',
        message: command
          ? `Update available: v${event.version}. Run: ${command}`
          : `Update available: v${event.version}`,
      }
    }

    case 'failed':
      return { kind: 'error', message: `Background update to v${event.version} failed.` }
  }
}

export { updateEvents } from './events'
