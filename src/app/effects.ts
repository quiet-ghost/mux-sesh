import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { checkAndUpdate, updateEvents } from '../update'
import { showTemporaryToast } from './notifications'
import { clearMatchIndices, filterAndSortItems } from '../search'
import {
  getProjectSelectionIndex,
  getSessionSelectionIndex,
  loadSessionCandidateItems,
} from './data'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import { measure } from '../util/perf'

export function useAutoUpdateScheduler(
  config: Config | null,
  hasScheduledAutoUpdateRef: MutableRefObject<boolean>
) {
  useEffect(() => {
    if (!config || hasScheduledAutoUpdateRef.current) {
      return
    }

    hasScheduledAutoUpdateRef.current = true

    const timeout = setTimeout(() => {
      checkAndUpdate(config).catch(error => {
        console.error('Auto-update check failed:', error)
      })
    }, 1000)

    return () => clearTimeout(timeout)
  }, [config, hasScheduledAutoUpdateRef])
}

export function useUpdateEventToasts(
  setUpdatedVersion: Dispatch<SetStateAction<string | null>>,
  setToastMessage: Dispatch<SetStateAction<string>>,
  setToastVisible: Dispatch<SetStateAction<boolean>>
) {
  useEffect(() => {
    const unsubscribe = updateEvents.on(event => {
      if (event.kind === 'updated') {
        setUpdatedVersion(event.version)
        showTemporaryToast(
          setToastMessage,
          setToastVisible,
          `Updated in background to v${event.version}. Restart mux-sesh to use it.`
        )
      } else if (event.kind === 'available') {
        showTemporaryToast(setToastMessage, setToastVisible, `Update available: v${event.version}`)
      } else {
        showTemporaryToast(
          setToastMessage,
          setToastVisible,
          `Background update to v${event.version} failed.`
        )
      }
    })

    return unsubscribe
  }, [setToastMessage, setToastVisible, setUpdatedVersion])
}

export function useNormalModeSessionReset(
  appMode: AppMode,
  viewMode: ViewMode,
  sessionItems: Item[],
  lastSessionSelectionRef: MutableRefObject<string | null>,
  setAllItems: Dispatch<SetStateAction<Item[]>>,
  setItems: Dispatch<SetStateAction<Item[]>>,
  setCursor: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    if (appMode !== AppMode.Normal || viewMode !== ViewMode.Sessions) {
      return
    }

    const cleanSessions = clearMatchIndices(sessionItems)
    setAllItems(cleanSessions)
    setItems(cleanSessions)
    setCursor(getSessionSelectionIndex(cleanSessions, lastSessionSelectionRef.current))
  }, [appMode, lastSessionSelectionRef, sessionItems, setAllItems, setCursor, setItems, viewMode])
}

export function useNewSessionProjectCursor(
  appMode: AppMode,
  viewMode: ViewMode,
  projectSourceItems: Item[],
  sessionCandidateItems: Item[],
  lastProjectSelectionRef: MutableRefObject<string | null>,
  setCursor: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    if (appMode !== AppMode.NewSession || viewMode !== ViewMode.Projects) {
      return
    }

    setCursor(
      getProjectSelectionIndex(
        sessionCandidateItems.length > 0 ? sessionCandidateItems : projectSourceItems,
        lastProjectSelectionRef.current
      )
    )
  }, [
    appMode,
    lastProjectSelectionRef,
    projectSourceItems,
    sessionCandidateItems,
    setCursor,
    viewMode,
  ])
}

export function useSessionCandidateLoader(
  appMode: AppMode,
  config: Config | null,
  lastProjectSelectionRef: MutableRefObject<string | null>,
  setSessionCandidateItems: Dispatch<SetStateAction<Item[]>>,
  setAllItems: Dispatch<SetStateAction<Item[]>>,
  setItems: Dispatch<SetStateAction<Item[]>>,
  setCursor: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    if (appMode !== AppMode.NewSession || !config) {
      return
    }

    const nextConfig = config
    let cancelled = false

    async function loadCandidates() {
      const linkedCandidates = await loadSessionCandidateItems(nextConfig, measure)
      if (cancelled) {
        return
      }

      setSessionCandidateItems(linkedCandidates)
      setAllItems(linkedCandidates)
      setItems(linkedCandidates)
      setCursor(getProjectSelectionIndex(linkedCandidates, lastProjectSelectionRef.current))
    }

    void loadCandidates()

    return () => {
      cancelled = true
    }
  }, [
    appMode,
    config,
    lastProjectSelectionRef,
    setAllItems,
    setCursor,
    setItems,
    setSessionCandidateItems,
  ])
}

export function useBoundedCursor(length: number, setCursor: Dispatch<SetStateAction<number>>) {
  useEffect(() => {
    if (length === 0) {
      setCursor(0)
      return
    }

    setCursor(current => Math.min(current, length - 1))
  }, [length, setCursor])
}

export function useResetCursorOnValue(value: string, setCursor: Dispatch<SetStateAction<number>>) {
  useEffect(() => {
    setCursor(0)
  }, [setCursor, value])
}

export function useSelectionMemory(
  appMode: AppMode,
  viewMode: ViewMode,
  cursor: number,
  items: Item[],
  selectedPrimaryItem: Item | undefined,
  lastProjectSelectionRef: MutableRefObject<string | null>,
  lastSessionSelectionRef: MutableRefObject<string | null>
) {
  useEffect(() => {
    const selectedItem = appMode === AppMode.NewSession ? items[cursor] : selectedPrimaryItem

    if (!selectedItem) {
      return
    }

    if (appMode === AppMode.NewSession || viewMode === ViewMode.Projects) {
      if (!selectedItem.isSession) {
        lastProjectSelectionRef.current = selectedItem.path
      }
      return
    }

    if (viewMode === ViewMode.Sessions && appMode === AppMode.Normal) {
      lastSessionSelectionRef.current = selectedItem.title
    }
  }, [
    appMode,
    cursor,
    items,
    lastProjectSelectionRef,
    lastSessionSelectionRef,
    selectedPrimaryItem,
    viewMode,
  ])
}

export function usePendingKillReset(
  pendingKillSessionName: string | null,
  appMode: AppMode,
  viewMode: ViewMode,
  opencodeSessions: Item[],
  opencodeCursor: number,
  regularSessions: Item[],
  cursor: number,
  setPendingKillSessionName: Dispatch<SetStateAction<string | null>>
) {
  useEffect(() => {
    if (!pendingKillSessionName) {
      return
    }

    const selectedSessionName =
      appMode === AppMode.OpencodeManage
        ? opencodeSessions[opencodeCursor]?.title
        : viewMode === ViewMode.Sessions
          ? regularSessions[cursor]?.title
          : undefined

    if (selectedSessionName !== pendingKillSessionName) {
      setPendingKillSessionName(null)
    }
  }, [
    appMode,
    cursor,
    opencodeCursor,
    opencodeSessions,
    pendingKillSessionName,
    regularSessions,
    setPendingKillSessionName,
    viewMode,
  ])
}

export function useSearchFiltering(
  appMode: AppMode,
  searchQuery: string,
  allItems: Item[],
  setItems: Dispatch<SetStateAction<Item[]>>,
  setCursor: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    if (appMode !== AppMode.Search && appMode !== AppMode.NewSession) {
      return
    }

    if (searchQuery.trim()) {
      setItems(filterAndSortItems(allItems, searchQuery))
      setCursor(0)
      return
    }

    setItems(allItems)
    setCursor(0)
  }, [allItems, appMode, searchQuery, setCursor, setItems])
}

export function useOpencodeStatsPolling(
  selectedOpencodeSessionName: string | undefined,
  loadOpencodeStatsForSession: (sessionName: string) => Promise<unknown>
) {
  useEffect(() => {
    if (!selectedOpencodeSessionName) {
      return
    }

    void loadOpencodeStatsForSession(selectedOpencodeSessionName)

    const interval = setInterval(() => {
      void loadOpencodeStatsForSession(selectedOpencodeSessionName)
    }, 2000)

    return () => {
      clearInterval(interval)
    }
  }, [loadOpencodeStatsForSession, selectedOpencodeSessionName])
}
