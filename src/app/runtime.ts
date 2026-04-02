import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { showTemporaryMessage } from './notifications'
import { applyOpencodeState, loadOpencodeSessionStats } from './opencode'
import { applyRefreshedViewState, loadRefreshedViewState } from './state'
import type { Measure } from './data'
import type { Config, Item, OpencodeSessionStats, OpencodeStatsState, ViewMode } from '../types'

interface AppRuntimeOptions {
  config: Config | null
  viewMode: ViewMode
  measure: Measure
  lastSessionSelectionRef: MutableRefObject<string | null>
  lastProjectSelectionRef: MutableRefObject<string | null>
  setSessionItems: Dispatch<SetStateAction<Item[]>>
  setProjectSourceItems: Dispatch<SetStateAction<Item[]>>
  setAllItems: Dispatch<SetStateAction<Item[]>>
  setItems: Dispatch<SetStateAction<Item[]>>
  setCursor: Dispatch<SetStateAction<number>>
  setMessage: Dispatch<SetStateAction<string>>
  getOpencodeSessionStats: (sessionName: string) => Promise<OpencodeSessionStats | null>
}

export function createAppRuntime(options: AppRuntimeOptions) {
  function showMessage(message: string, timeout = 2000) {
    showTemporaryMessage(options.setMessage, message, timeout)
  }

  function updateOpencodeState(sessionName: string, nextState: OpencodeStatsState) {
    applyOpencodeState(
      sessionName,
      nextState,
      options.setSessionItems,
      options.setAllItems,
      options.setItems
    )
  }

  async function refreshItems(forceViewMode?: ViewMode, nextConfig = options.config) {
    if (!nextConfig) {
      return
    }

    const targetMode = forceViewMode ?? options.viewMode
    const refreshedState = await loadRefreshedViewState(
      targetMode,
      nextConfig,
      options.measure,
      options.lastSessionSelectionRef.current,
      options.lastProjectSelectionRef.current
    )

    applyRefreshedViewState(
      refreshedState,
      options.setSessionItems,
      options.setProjectSourceItems,
      options.setAllItems,
      options.setItems,
      options.setCursor
    )
  }

  async function loadOpencodeStatsForSession(sessionName: string) {
    return loadOpencodeSessionStats(
      sessionName,
      options.getOpencodeSessionStats,
      updateOpencodeState,
      showMessage
    )
  }

  return {
    showMessage,
    refreshItems,
    loadOpencodeStatsForSession,
  }
}
