import type { Config, ViewMode } from '../types'

type ShowMessage = (message: string, timeout?: number) => void
type RefreshItems = (forceViewMode?: ViewMode, nextConfig?: Config) => Promise<void>

export async function runWithErrorMessage(
  operation: () => Promise<void>,
  fallbackMessage: string,
  showMessage: ShowMessage
): Promise<void> {
  try {
    await operation()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : fallbackMessage
    showMessage(errorMessage, 3000)
  }
}

export async function persistConfigUpdate(
  nextConfig: Config,
  successMessage: string,
  saveConfig: (config: Config) => Promise<void>,
  setConfig: (config: Config) => void,
  refreshItems: RefreshItems,
  showMessage: ShowMessage
): Promise<void> {
  await saveConfig(nextConfig)
  setConfig(nextConfig)
  await refreshItems(undefined, nextConfig)
  showMessage(successMessage)
}
