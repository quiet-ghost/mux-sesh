import type { Dispatch, SetStateAction } from 'react'
import { showTemporaryMessage } from './notifications'
import type { SessionInventory } from './session-inventory'
import type { Config, Item, ViewMode } from '../types'
import type { MultiplexerBackend } from '../multiplexer'

interface AppRuntimeOptions {
  config: Config | null
  backend: MultiplexerBackend | null
  viewMode: ViewMode
  inventory: SessionInventory
  setMessage: Dispatch<SetStateAction<string>>
}

export function createAppRuntime(options: AppRuntimeOptions) {
  function showMessage(message: string, timeout = 2000) {
    showTemporaryMessage(options.setMessage, message, timeout)
  }

  async function refreshItems(forceViewMode?: ViewMode, nextConfig = options.config) {
    if (!nextConfig || !options.backend) {
      return
    }

    await options.inventory.refresh(
      { kind: 'refresh', viewMode: forceViewMode ?? options.viewMode },
      { config: nextConfig, backend: options.backend }
    )
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
    showMessage,
    refreshItems,
    reloadSessions,
  }
}
