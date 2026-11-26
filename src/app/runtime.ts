import type { Dispatch, SetStateAction } from 'react'
import { showTemporaryMessage } from './notifications'
import type { SessionInventory } from './session-inventory'
import type { Config, ViewMode } from '../types'
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

  return {
    showMessage,
    refreshItems,
  }
}
