import type { ShowToast } from './notifications'
import type { SessionInventory } from './session-inventory'
import type { ViewMode } from './app-mode'
import type { Config } from '../config/config-model'
import type { Item } from '../items/item'
import type { MultiplexerBackend } from '../multiplexer'

interface AppRuntimeOptions {
  config: Config | null
  backend: MultiplexerBackend | null
  viewMode: ViewMode
  inventory: SessionInventory
  showToast: ShowToast
}

export function createAppRuntime(options: AppRuntimeOptions) {
  async function refreshItems(forceViewMode?: ViewMode, nextConfig = options.config) {
    if (!nextConfig || !options.backend) {
      return
    }

    await options.inventory.refresh(
      { kind: 'refresh', viewMode: forceViewMode ?? options.viewMode },
      { config: nextConfig, backend: options.backend }
    )
  }

  // A manual refresh confirms only a published list; a failed read stays on the status line.
  async function refreshList(): Promise<void> {
    if (!options.config || !options.backend) return

    const outcome = await options.inventory.refresh(
      { kind: 'refresh', viewMode: options.viewMode },
      { config: options.config, backend: options.backend }
    )

    if (outcome.kind === 'published') options.showToast({ kind: 'success', message: 'Refreshed' })
  }

  // Refreshes like refreshItems, and returns the published session list for reconciling a close.
  async function reloadSessions(): Promise<readonly Item[] | undefined> {
    if (!options.config || !options.backend) return undefined

    const outcome = await options.inventory.refresh(
      { kind: 'refresh', viewMode: options.viewMode },
      { config: options.config, backend: options.backend }
    )

    return outcome.kind === 'published' ? outcome.snapshot.sessionItems : undefined
  }

  return {
    refreshItems,
    refreshList,
    reloadSessions,
  }
}
