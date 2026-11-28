import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { loadConfig } from '../config'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import type { AppEffectRuntime } from './effect-runtime'
import { resolveMultiplexerBackend, type MultiplexerBackend } from '../multiplexer'
import { CommandInterrupted, type CommandRunner } from '../multiplexer/command'
import { isBackendFailure } from '../multiplexer/failure'
import { requestFatalShutdown } from '../lifecycle/shutdown'
import { loadProjectSourceItems, type Measure } from './data'
import type { SessionInventory } from './session-inventory'

export type StartupFailureStage = 'config' | 'backend' | 'inventory'

export interface StartupFailure {
  readonly stage: StartupFailureStage
  readonly message: string
}

export type StartupState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'failed'; readonly failure: StartupFailure }
  | { readonly kind: 'retrying'; readonly failure: StartupFailure }

export interface StartupDependencies {
  readonly loadConfig: () => Promise<Config>
  readonly resolveBackend: (config: Config, runner: CommandRunner) => Promise<MultiplexerBackend>
}

const DEFAULT_STARTUP_DEPENDENCIES: StartupDependencies = {
  loadConfig,
  resolveBackend: (config, runner) =>
    resolveMultiplexerBackend({ preference: config.backend, runner }),
}

type StartupAttempt =
  | { readonly kind: 'ready'; readonly config: Config }
  | { readonly kind: 'failed'; readonly failure: StartupFailure }
  | { readonly kind: 'stopped' }

function failed(stage: StartupFailureStage, message: string): StartupAttempt {
  return { kind: 'failed', failure: { stage, message } }
}

export interface AppStartup {
  readonly startup: StartupState
  // Re-runs only startup, and only after a failure; a second request while one runs is ignored.
  readonly retryStartup: () => void
}

export function useAppStartup(
  effects: AppEffectRuntime,
  measure: Measure,
  inventory: SessionInventory,
  mark: (label: string) => void,
  setConfig: Dispatch<SetStateAction<Config | null>>,
  setBackend: Dispatch<SetStateAction<MultiplexerBackend | null>>,
  setAppMode: Dispatch<SetStateAction<AppMode>>,
  setProjectSourceItems: Dispatch<SetStateAction<Item[]>>,
  dependencies: StartupDependencies = DEFAULT_STARTUP_DEPENDENCIES
): AppStartup {
  const [startup, setStartup] = useState<StartupState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const startupRef = useRef(startup)
  startupRef.current = startup

  useEffect(() => {
    let cancelled = false

    // Config failures are I/O/parse failures at the file boundary; nothing was written over the file.
    async function run(): Promise<StartupAttempt> {
      mark('startup begin')

      let config: Config

      try {
        config = await measure('loadConfig', dependencies.loadConfig)
      } catch (cause) {
        return failed(
          'config',
          cause instanceof Error ? cause.message : 'The config could not be read.'
        )
      }

      if (cancelled) return { kind: 'stopped' }

      let backend: MultiplexerBackend

      try {
        backend = await measure('resolveBackend', () =>
          dependencies.resolveBackend(config, effects.runner)
        )
      } catch (cause) {
        // Unmounting (a crash, or quitting) disposes the runtime and interrupts the probe.
        if (cancelled && cause instanceof CommandInterrupted) return { kind: 'stopped' }

        if (!isBackendFailure(cause)) throw cause

        return failed('backend', cause.message)
      }

      if (cancelled) return { kind: 'stopped' }
      setConfig(config)
      setBackend(backend)
      setAppMode(config.keybindMode === 'standard' ? AppMode.Search : AppMode.Normal)

      const outcome = await inventory.refresh({ kind: 'startup' }, { config, backend })

      if (cancelled) return { kind: 'stopped' }

      switch (outcome.kind) {
        case 'failed':
          return failed('inventory', outcome.failure.message)
        case 'interrupted':
        case 'superseded':
        case 'defect':
          return { kind: 'stopped' }
        case 'published':
          mark('startup complete')

          if (outcome.snapshot.viewMode !== ViewMode.Projects) {
            const projectSourceItems = await loadProjectSourceItems(config, measure)

            if (!cancelled) setProjectSourceItems(projectSourceItems)
          }

          return { kind: 'ready', config }
      }
    }

    run().then(result => {
      if (cancelled) return

      if (result.kind === 'ready') setStartup({ kind: 'ready' })
      else if (result.kind === 'failed') setStartup({ kind: 'failed', failure: result.failure })
    }, requestFatalShutdown)

    return () => {
      cancelled = true
    }
  }, [
    attempt,
    dependencies,
    effects,
    inventory,
    mark,
    measure,
    setAppMode,
    setBackend,
    setConfig,
    setProjectSourceItems,
  ])

  const retryStartup = useCallback(() => {
    const current = startupRef.current

    if (current.kind !== 'failed') return

    const retrying: StartupState = { kind: 'retrying', failure: current.failure }
    startupRef.current = retrying
    setStartup(retrying)
    setAttempt(value => value + 1)
  }, [])

  return { startup, retryStartup }
}
