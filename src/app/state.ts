import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { loadConfig } from '../config'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import type { AppEffectRuntime } from './effect-runtime'
import { resolveMultiplexerBackend, type MultiplexerBackend } from '../multiplexer'
import { loadProjectSourceItems, type Measure } from './data'
import type { SessionInventory } from './session-inventory'

export function useAppStartup(
  effects: AppEffectRuntime,
  measure: Measure,
  inventory: SessionInventory,
  mark: (label: string) => void,
  setConfig: Dispatch<SetStateAction<Config | null>>,
  setBackend: Dispatch<SetStateAction<MultiplexerBackend | null>>,
  setMessage: Dispatch<SetStateAction<string>>,
  setAppMode: Dispatch<SetStateAction<AppMode>>,
  setProjectSourceItems: Dispatch<SetStateAction<Item[]>>
) {
  useEffect(() => {
    let cancelled = false

    async function init() {
      mark('startup begin')
      const config = await measure('loadConfig', loadConfig)

      if (cancelled) {
        return
      }

      const startupAppMode = config.keybindMode === 'standard' ? AppMode.Search : AppMode.Normal

      const backend = await measure('resolveBackend', () =>
        resolveMultiplexerBackend({ preference: config.backend, runner: effects.runner })
      )

      if (cancelled) return
      setConfig(config)
      setBackend(backend)
      setAppMode(startupAppMode)

      const outcome = await inventory.refresh({ kind: 'startup' }, { config, backend })

      if (cancelled) {
        return
      }

      if (outcome.kind === 'published') mark('startup complete')

      if (
        outcome.kind === 'interrupted' ||
        outcome.kind === 'defect' ||
        (outcome.kind === 'published' && outcome.snapshot.viewMode === ViewMode.Projects)
      ) {
        return
      }

      const projectSourceItems = await loadProjectSourceItems(config, measure)

      if (cancelled) {
        return
      }

      setProjectSourceItems(projectSourceItems)
    }

    void init().catch(error => {
      if (!cancelled) {
        setMessage(error instanceof Error ? error.message : 'Failed to start mux-sesh')
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    effects,
    inventory,
    mark,
    measure,
    setAppMode,
    setBackend,
    setConfig,
    setMessage,
    setProjectSourceItems,
  ])
}
