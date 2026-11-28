import type { Config, ViewMode } from '../types'
import {
  failureKind,
  isExpectedActionFailure,
  reasonOf,
  type ActionOutcome,
} from './action-outcome'
import type { ShowToast } from './notifications'

type RefreshItems = (forceViewMode?: ViewMode, nextConfig?: Config) => Promise<void>

// Expected failures become a toast; defects propagate to crash recovery.
export async function runWithErrorToast(
  operation: () => Promise<void>,
  showToast: ShowToast
): Promise<void> {
  try {
    await operation()
  } catch (cause) {
    if (!isExpectedActionFailure(cause)) throw cause

    showToast({ kind: failureKind(cause), message: cause.message })
  }
}

// The config file is replaced atomically, so a failed save leaves it unchanged. Once saved,
// a failed refresh never hides the save: it is reported with a refresh-only retry.
export async function persistConfigUpdate(
  nextConfig: Config,
  successMessage: string,
  saveConfig: (config: Config) => Promise<void>,
  setConfig: (config: Config) => void,
  refreshItems: RefreshItems
): Promise<ActionOutcome> {
  try {
    await saveConfig(nextConfig)
  } catch (cause) {
    return {
      kind: 'failed',
      message: `Could not save settings: ${reasonOf(cause)}. The settings file was not changed.`,
    }
  }

  setConfig(nextConfig)

  try {
    await refreshItems(undefined, nextConfig)
  } catch (cause) {
    if (!isExpectedActionFailure(cause)) throw cause

    return {
      kind: 'partial',
      title: 'Settings saved, but the list was not refreshed',
      completed: [`${successMessage} and saved`],
      failed: `Refreshing the list: ${cause.message}`,
      next: 'The saved settings stay in effect. Press Enter to refresh the list, or Esc to keep the current one.',
      retry: { kind: 'refresh' },
    }
  }

  return { kind: 'completed', message: successMessage }
}
