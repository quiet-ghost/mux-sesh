import { useEffect } from 'react'
import type { MultiplexerBackend } from '../multiplexer/types'
import { AppMode, ViewMode, type Config } from '../types'
import { requestFatalShutdown } from '../util/shutdown'
import { loadSessionItems, type Measure } from './data'
import { readEffect, type AppEffectRuntime } from './effect-runtime'
import type { SessionInventory } from './session-inventory'

export function refreshHerdrInventory(
  effects: AppEffectRuntime,
  config: Config,
  backend: MultiplexerBackend,
  measure: Measure,
  signal?: AbortSignal
) {
  return effects.run(
    readEffect(() => loadSessionItems(config, measure, backend, 'agents-poll')),
    { signal }
  )
}

// Polls only ask the inventory owner to refresh; it coalesces them with any load in flight.
export function useHerdrAgentPolling(
  inventory: SessionInventory,
  appMode: AppMode,
  viewMode: ViewMode,
  config: Config | null,
  backend: MultiplexerBackend | null
) {
  useEffect(() => {
    if (
      appMode !== AppMode.AgentsManage ||
      viewMode !== ViewMode.Sessions ||
      !config ||
      backend?.kind !== 'herdr'
    ) {
      return
    }

    const context = { config, backend }

    const poll = () => {
      inventory.refresh({ kind: 'agents-poll' }, context).catch(requestFatalShutdown)
    }

    poll()
    const interval = setInterval(poll, 2000)

    return () => {
      clearInterval(interval)
    }
  }, [appMode, backend, config, inventory, viewMode])
}
