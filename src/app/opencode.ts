import type { Dispatch, SetStateAction } from 'react'
import type { Item, OpencodeSessionStats, OpencodeStatsState } from '../types'

export function applyOpencodeState(
  sessionName: string,
  nextState: OpencodeStatsState,
  setSessionItems: Dispatch<SetStateAction<Item[]>>,
  setAllItems: Dispatch<SetStateAction<Item[]>>,
  setItems: Dispatch<SetStateAction<Item[]>>
) {
  const applyState = (existingItems: Item[]) =>
    existingItems.map(item =>
      item.title === sessionName ? { ...item, opencodeState: nextState } : item
    )

  setSessionItems(applyState)
  setAllItems(applyState)
  setItems(applyState)
}

export async function loadOpencodeSessionStats(
  sessionName: string,
  getStats: (sessionName: string) => Promise<OpencodeSessionStats | null>,
  updateState: (sessionName: string, nextState: OpencodeStatsState) => void,
  showMessage: (message: string, timeout?: number) => void
) {
  updateState(sessionName, { status: 'loading' })

  try {
    const stats = await getStats(sessionName)

    if (stats) {
      updateState(sessionName, { status: 'ready', stats })
      return stats
    }

    updateState(sessionName, {
      status: 'missing',
      message: `No OpenCode stats found for '${sessionName}'`,
    })
    return null
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : `Failed to load stats for '${sessionName}'`
    updateState(sessionName, { status: 'error', message: errorMessage })
    showMessage(errorMessage, 4000)
    return null
  }
}
