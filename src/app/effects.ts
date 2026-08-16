import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { isOpencodeSessionItem } from '../opencode/session-name'
import { checkAndUpdate, updateEvents } from '../update'
import { showTemporaryToast } from './notifications'
import { clearMatchIndices, filterAndSortItems } from '../search'
import { combineFileSearchResults, searchFilesAndDirectories, warmFileSearch } from '../search/fff'
import { annotateProjectItemsWithSessionLinks } from '../projects/session-links'
import {
  getProjectSelectionIndex,
  getAgentSelectionIndex,
  getSessionSelectionIndex,
  loadSessionCandidateItems,
  loadSessionItems,
  reuseSessionItemIdentities,
} from './data'
import { SYSTEM_THEME_ID } from '../styles/theme'
import { subscribeThemeFollow } from '../styles/theme-follow'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey } from '../multiplexer/items'
import { clampCursorIndex } from '../ui/list-window'
import { isGitHubURL } from '../util/github'
import { measure } from '../util/perf'

const FILE_SEARCH_DEBOUNCE_MS = 120

export function useSystemThemeFollow(
  themeId: string | undefined,
  homeDir: string,
  onRefresh: () => void
) {
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    if (themeId !== SYSTEM_THEME_ID) {
      return
    }

    const subscription = subscribeThemeFollow(homeDir, {
      onRefresh: () => {
        onRefreshRef.current()
      },
    })

    return () => {
      subscription.stop()
    }
  }, [homeDir, themeId])
}

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
  backend: MultiplexerBackend | null,
  lastProjectSelectionRef: MutableRefObject<string | null>,
  setSessionCandidateItems: Dispatch<SetStateAction<Item[]>>,
  setAllItems: Dispatch<SetStateAction<Item[]>>,
  setItems: Dispatch<SetStateAction<Item[]>>,
  setCursor: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    if (appMode !== AppMode.NewSession || !config || !backend) {
      return
    }

    const nextConfig = config
    const activeBackend = backend
    let cancelled = false

    async function loadCandidates() {
      const linkedCandidates = await loadSessionCandidateItems(nextConfig, measure, activeBackend)
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
    backend,
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
      lastSessionSelectionRef.current = getItemKey(selectedItem)
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

    const selectedSession =
      appMode === AppMode.AgentsManage
        ? agentSessions[agentCursor]
        : viewMode === ViewMode.Sessions
          ? regularSessions[cursor]
          : undefined

    if (!selectedSession || getItemKey(selectedSession) !== pendingKillSessionName) {
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
  selectedAgentSession: Item | undefined,
  loadOpencodeStatsForSession: (sessionName: string) => Promise<unknown>
) {
  const loadStatsRef = useRef(loadOpencodeStatsForSession)
  loadStatsRef.current = loadOpencodeStatsForSession
  const selectedSessionName =
    selectedAgentSession && isOpencodeSessionItem(selectedAgentSession)
      ? selectedAgentSession.title
      : undefined

  useEffect(() => {
    if (!selectedSessionName) {
      return
    }

    void loadStatsRef.current(selectedSessionName)

    const interval = setInterval(() => {
      void loadStatsRef.current(selectedSessionName)
    }, 2000)

    return () => {
      clearInterval(interval)
    }
  }, [selectedSessionName])
}

export function useHerdrAgentPolling(
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

    let cancelled = false
    let polling = false
    let reportedError: string | undefined

    const poll = async () => {
      if (polling) {
        return
      }
      polling = true
      try {
        const { sessionItems } = await loadSessionItems(config, measure, backend, 'agents-poll')
        if (cancelled) {
          return
        }

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
      } catch (error) {
        if (!cancelled && !reportedError) {
          reportedError = error instanceof Error ? error.message : 'Failed to refresh Herdr agents'
          setMessage(reportedError)
        }
      } finally {
        polling = false
      }
    }

    void poll()
    const interval = setInterval(() => void poll(), 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
      if (reportedError) {
        const abandonedError = reportedError
        setMessage(current => (current === abandonedError ? '' : current))
      }
    }
  }, [
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

interface UseAppBehaviorsOptions {
  appMode: AppMode
  viewMode: ViewMode
  config: Config | null
  backend: MultiplexerBackend | null
  sessionItems: Item[]
  projectSourceItems: Item[]
  sessionCandidateItems: Item[]
  lastSessionSelectionRef: MutableRefObject<string | null>
  lastProjectSelectionRef: MutableRefObject<string | null>
  setAllItems: Dispatch<SetStateAction<Item[]>>
  setItems: Dispatch<SetStateAction<Item[]>>
  setSessionItems: Dispatch<SetStateAction<Item[]>>
  setCursor: Dispatch<SetStateAction<number>>
  setAgentCursor: Dispatch<SetStateAction<number>>
  setMessage: Dispatch<SetStateAction<string>>
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
  selectedAgentSession: Item | undefined
  loadOpencodeStatsForSession: (sessionName: string) => Promise<unknown>
  setUpdatedVersion: Dispatch<SetStateAction<string | null>>
  setToastMessage: Dispatch<SetStateAction<string>>
  setToastVisible: Dispatch<SetStateAction<boolean>>
  homeDir: string
  onSystemThemeRefresh: () => void
}

export function useAppBehaviors(options: UseAppBehaviorsOptions) {
  useSystemThemeFollow(options.config?.theme, options.homeDir, options.onSystemThemeRefresh)
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
    options.backend,
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
  useOpencodeStatsPolling(options.selectedAgentSession, options.loadOpencodeStatsForSession)
  useHerdrAgentPolling(
    options.appMode,
    options.viewMode,
    options.config,
    options.backend,
    options.selectedAgentSession,
    options.agentCursor,
    options.setSessionItems,
    options.setAllItems,
    options.setItems,
    options.setAgentCursor,
    options.setMessage
  )
}
