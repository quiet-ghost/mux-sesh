import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { isOpencodeSessionName } from '../opencode/session-name'
import { checkAndUpdate, updateEvents } from '../update'
import { showTemporaryToast } from './notifications'
import { clearMatchIndices, filterAndSortItems } from '../search'
import { combineFileSearchResults, searchFilesAndDirectories, warmFileSearch } from '../search/fff'
import { annotateProjectItemsWithSessionLinks } from '../projects/session-links'
import {
  getProjectSelectionIndex,
  getSessionSelectionIndex,
  loadSessionCandidateItems,
} from './data'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import { clampCursorIndex } from '../ui/list-window'
import { isGitHubURL } from '../util/github'
import { measure } from '../util/perf'

const FILE_SEARCH_DEBOUNCE_MS = 120

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

    setCursor(current => clampCursorIndex(length, current))
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
  agentSessions: Item[],
  agentCursor: number,
  regularSessions: Item[],
  cursor: number,
  setPendingKillSessionName: Dispatch<SetStateAction<string | null>>
) {
  useEffect(() => {
    if (!pendingKillSessionName) {
      return
    }

    const selectedSessionName =
      appMode === AppMode.AgentsManage
        ? agentSessions[agentCursor]?.title
        : viewMode === ViewMode.Sessions
          ? regularSessions[cursor]?.title
          : undefined

    if (selectedSessionName !== pendingKillSessionName) {
      setPendingKillSessionName(null)
    }
  }, [
    appMode,
    cursor,
    agentCursor,
    agentSessions,
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

export function useNewSessionFileSearch(
  appMode: AppMode,
  config: Config | null,
  searchQuery: string,
  sessionItems: Item[],
  setItems: Dispatch<SetStateAction<Item[]>>,
  setCursor: Dispatch<SetStateAction<number>>
) {
  const sessionItemsRef = useRef(sessionItems)
  sessionItemsRef.current = sessionItems

  useEffect(() => {
    if (appMode !== AppMode.NewSession || !config) {
      return
    }

    const nextConfig = config
    const query = searchQuery.trim()

    if (!query || isGitHubURL(query)) {
      void warmFileSearch(nextConfig)
      return
    }

    let cancelled = false

    async function runFileSearch() {
      const fileSearchItems = await searchFilesAndDirectories(query, nextConfig)
      if (cancelled || fileSearchItems.length === 0) {
        return
      }

      const liveSessions = sessionItemsRef.current.filter(item => item.isSession)
      const annotated = await annotateProjectItemsWithSessionLinks(
        fileSearchItems,
        liveSessions,
        nextConfig
      )
      if (cancelled) {
        return
      }

      setItems(current => combineFileSearchResults(annotated, current, query))
      setCursor(0)
    }

    const timeout = setTimeout(() => {
      void runFileSearch()
    }, FILE_SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [appMode, config, searchQuery, setCursor, setItems])
}

export function useOpencodeStatsPolling(
  selectedAgentSessionName: string | undefined,
  loadOpencodeStatsForSession: (sessionName: string) => Promise<unknown>
) {
  const loadStatsRef = useRef(loadOpencodeStatsForSession)
  loadStatsRef.current = loadOpencodeStatsForSession

  useEffect(() => {
    if (!selectedAgentSessionName || !isOpencodeSessionName(selectedAgentSessionName)) {
      return
    }

    void loadStatsRef.current(selectedAgentSessionName)

    const interval = setInterval(() => {
      void loadStatsRef.current(selectedAgentSessionName)
    }, 2000)

    return () => {
      clearInterval(interval)
    }
  }, [selectedAgentSessionName])
}

interface UseAppBehaviorsOptions {
  appMode: AppMode
  viewMode: ViewMode
  config: Config | null
  sessionItems: Item[]
  projectSourceItems: Item[]
  sessionCandidateItems: Item[]
  lastSessionSelectionRef: MutableRefObject<string | null>
  lastProjectSelectionRef: MutableRefObject<string | null>
  setAllItems: Dispatch<SetStateAction<Item[]>>
  setItems: Dispatch<SetStateAction<Item[]>>
  setCursor: Dispatch<SetStateAction<number>>
  setSessionCandidateItems: Dispatch<SetStateAction<Item[]>>
  filteredCommandEntriesLength: number
  setCommandsCursor: Dispatch<SetStateAction<number>>
  commandsSearchQuery: string
  filteredSettingsEntriesLength: number
  setSettingsCursor: Dispatch<SetStateAction<number>>
  filteredSettingOptionsLength: number
  setSettingOptionsCursor: Dispatch<SetStateAction<number>>
  cursor: number
  items: Item[]
  selectedPrimaryItem: Item | undefined
  pendingKillSessionName: string | null
  agentSessions: Item[]
  agentCursor: number
  regularSessions: Item[]
  setPendingKillSessionName: Dispatch<SetStateAction<string | null>>
  searchQuery: string
  allItems: Item[]
  selectedAgentSessionName: string | undefined
  loadOpencodeStatsForSession: (sessionName: string) => Promise<unknown>
  setUpdatedVersion: Dispatch<SetStateAction<string | null>>
  setToastMessage: Dispatch<SetStateAction<string>>
  setToastVisible: Dispatch<SetStateAction<boolean>>
}

export function useAppBehaviors(options: UseAppBehaviorsOptions) {
  useUpdateEventToasts(options.setUpdatedVersion, options.setToastMessage, options.setToastVisible)
  useNormalModeSessionReset(
    options.appMode,
    options.viewMode,
    options.sessionItems,
    options.lastSessionSelectionRef,
    options.setAllItems,
    options.setItems,
    options.setCursor
  )
  useNewSessionProjectCursor(
    options.appMode,
    options.viewMode,
    options.projectSourceItems,
    options.sessionCandidateItems,
    options.lastProjectSelectionRef,
    options.setCursor
  )
  useSessionCandidateLoader(
    options.appMode,
    options.config,
    options.lastProjectSelectionRef,
    options.setSessionCandidateItems,
    options.setAllItems,
    options.setItems,
    options.setCursor
  )
  useBoundedCursor(options.filteredCommandEntriesLength, options.setCommandsCursor)
  useResetCursorOnValue(options.commandsSearchQuery, options.setCommandsCursor)
  useBoundedCursor(options.filteredSettingsEntriesLength, options.setSettingsCursor)
  useBoundedCursor(options.filteredSettingOptionsLength, options.setSettingOptionsCursor)
  useSelectionMemory(
    options.appMode,
    options.viewMode,
    options.cursor,
    options.items,
    options.selectedPrimaryItem,
    options.lastProjectSelectionRef,
    options.lastSessionSelectionRef
  )
  usePendingKillReset(
    options.pendingKillSessionName,
    options.appMode,
    options.viewMode,
    options.agentSessions,
    options.agentCursor,
    options.regularSessions,
    options.cursor,
    options.setPendingKillSessionName
  )
  useSearchFiltering(
    options.appMode,
    options.searchQuery,
    options.allItems,
    options.setItems,
    options.setCursor
  )
  useNewSessionFileSearch(
    options.appMode,
    options.config,
    options.searchQuery,
    options.sessionItems,
    options.setItems,
    options.setCursor
  )
  useOpencodeStatsPolling(options.selectedAgentSessionName, options.loadOpencodeStatsForSession)
}
