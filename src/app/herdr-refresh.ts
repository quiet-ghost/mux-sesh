import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { MultiplexerBackend } from '../multiplexer/types'
import { getItemKey } from '../multiplexer/items'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import { requestFatalShutdown } from '../util/shutdown'
import { measure } from '../util/perf'
import {
  getAgentSelectionIndex,
  loadSessionItems,
  reuseSessionItemIdentities,
  type Measure,
} from './data'
import { readEffect, type AppEffectRuntime } from './effect-runtime'

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

export function useHerdrAgentPolling(
  effects: AppEffectRuntime,
  appMode: AppMode,
  viewMode: ViewMode,
  config: Config | null,
  backend: MultiplexerBackend | null,
  selectedAgentSession: Item | undefined,
  agentCursor: number,
  setSessionItems: Dispatch<SetStateAction<Item[]>>,
  setAllItems: Dispatch<SetStateAction<Item[]>>,
  setItems: Dispatch<SetStateAction<Item[]>>,
  setAgentCursor: Dispatch<SetStateAction<number>>,
  setMessage: Dispatch<SetStateAction<string>>
) {
  const selectedKeyRef = useRef<string | undefined>(undefined)
  const agentCursorRef = useRef(agentCursor)
  selectedKeyRef.current = selectedAgentSession ? getItemKey(selectedAgentSession) : undefined
  agentCursorRef.current = agentCursor

  useEffect(() => {
    if (
      appMode !== AppMode.AgentsManage ||
      viewMode !== ViewMode.Sessions ||
      !config ||
      backend?.kind !== 'herdr'
    ) {
      return
    }

    const controller = new AbortController()
    let polling = false
    let reportedError: string | undefined

    const poll = async () => {
      if (polling) return
      polling = true

      try {
        const result = await refreshHerdrInventory(
          effects,
          config,
          backend,
          measure,
          controller.signal
        )

        if (controller.signal.aborted) return

        switch (result.kind) {
          case 'failure':
            if (!reportedError) {
              reportedError = `${result.error.message} Existing sessions are unchanged; refresh will retry.`
              setMessage(reportedError)
            }

            return
          case 'interrupted':
            return
          case 'defect':
            requestFatalShutdown(result.cause)

            return
          case 'success': {
            const { sessionItems } = result.value
            setSessionItems(current => reuseSessionItemIdentities(current, sessionItems))
            setAllItems(current => reuseSessionItemIdentities(current, sessionItems))
            setItems(current => reuseSessionItemIdentities(current, sessionItems))
            setAgentCursor(
              getAgentSelectionIndex(sessionItems, selectedKeyRef.current, agentCursorRef.current)
            )

            if (reportedError) {
              const recoveredError = reportedError
              setMessage(current => (current === recoveredError ? '' : current))
              reportedError = undefined
            }
          }
        }
      } finally {
        polling = false
      }
    }

    const startPoll = () => {
      poll().catch(requestFatalShutdown)
    }

    startPoll()
    const interval = setInterval(startPoll, 2000)

    return () => {
      controller.abort()
      clearInterval(interval)

      if (reportedError) {
        const abandonedError = reportedError
        setMessage(current => (current === abandonedError ? '' : current))
      }
    }
  }, [
    effects,
    appMode,
    backend,
    config,
    setAgentCursor,
    setAllItems,
    setItems,
    setMessage,
    setSessionItems,
    viewMode,
  ])
}
