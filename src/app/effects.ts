import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { useRenderer } from '@opentui/react'
import type { TerminalColors } from '@opentui/core'
import { checkAndUpdate, updateEvents } from '../update'
import { showTemporaryMessage, showTemporaryToast } from './notifications'
import { useHerdrAgentPolling } from './herdr-refresh'
import type { SessionInventory } from './session-inventory'
import { clearMatchIndices, filterAndSortItems } from '../search'
import { combineFileSearchResults, searchFilesAndDirectories, warmFileSearch } from '../search/fff'
import { annotateProjectItemsWithSessionLinks } from '../projects/session-links'
import {
  getProjectSelectionIndex,
  getSessionSelectionIndex,
  loadSessionCandidateItems,
} from './data'
import { SYSTEM_THEME_ID } from '../styles/theme'
import { subscribeThemeFollow, type SubscribeThemeFollowOptions } from '../styles/theme-follow'
import { terminalColorsToPalette, type TerminalPalette } from '../styles/terminal-palette'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey } from '../multiplexer/items'
import { describeDiscoveryFailures } from '../tmux/project-discovery-service'
import { subscribeProjectDiscoveryFailures } from '../tmux/projects'
import { clampCursorIndex } from '../ui/list-window'
import { isGitHubURL } from '../util/github'
import { measure } from '../util/perf'

const FILE_SEARCH_DEBOUNCE_MS = 120
const DISCOVERY_FAILURE_MESSAGE_MS = 8000

export function useSystemThemeFollow(
  themeId: string | undefined,
  homeDir: string,
  onRefresh: () => void,
  followOptions?: SubscribeThemeFollowOptions
) {
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const followOptionsRef = useRef(followOptions)
  followOptionsRef.current = followOptions

  useEffect(() => {
    if (themeId !== SYSTEM_THEME_ID) {
      return
    }

    const subscription = subscribeThemeFollow(
      homeDir,
      {
        onRefresh: () => {
          onRefreshRef.current()
        },
      },
      followOptionsRef.current
    )

    return () => {
      subscription.stop()
    }
  }, [homeDir, themeId])
}

export function useTerminalPalette(
  themeId: string | undefined,
  onPalette: (palette: TerminalPalette | null) => void
) {
  const renderer = useRenderer()
  const onPaletteRef = useRef(onPalette)
  onPaletteRef.current = onPalette

  useEffect(() => {
    if (themeId !== SYSTEM_THEME_ID) {
      onPaletteRef.current(null)
      return
    }

    let cancelled = false

    const publish = (colors: TerminalColors): void => {
      if (!cancelled) {
        onPaletteRef.current(terminalColorsToPalette(colors))
      }
    }

    void renderer.getPalette().then(colors => {
      publish(colors)
    })

    renderer.on('palette', publish)
    return () => {
      cancelled = true
      renderer.off('palette', publish)
    }
  }, [renderer, themeId])
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

export function useProjectDiscoveryFailureMessages(setMessage: Dispatch<SetStateAction<string>>) {
  useEffect(
    () =>
      subscribeProjectDiscoveryFailures(failures => {
        showTemporaryMessage(
          setMessage,
          describeDiscoveryFailures(failures),
          DISCOVERY_FAILURE_MESSAGE_MS
        )
      }),
    [setMessage]
  )
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
  setCursor: Dispatch<SetStateAction<number>>,
  filterItems: typeof filterAndSortItems = filterAndSortItems
) {
  useEffect(() => {
    if (appMode !== AppMode.Search && appMode !== AppMode.NewSession) {
      return
    }

    if (searchQuery.trim()) {
      setItems(filterItems(allItems, searchQuery))
      setCursor(0)
      return
    }

    setItems(allItems)
    setCursor(0)
  }, [allItems, appMode, filterItems, searchQuery, setCursor, setItems])
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

interface UseAppBehaviorsOptions {
  inventory: SessionInventory
  setMessage: Dispatch<SetStateAction<string>>
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
  setCursor: Dispatch<SetStateAction<number>>
  setSessionCandidateItems: Dispatch<SetStateAction<Item[]>>
  filteredCommandEntriesLength: number
  setCommandsCursor: Dispatch<SetStateAction<number>>
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
  setUpdatedVersion: Dispatch<SetStateAction<string | null>>
  setToastMessage: Dispatch<SetStateAction<string>>
  setToastVisible: Dispatch<SetStateAction<boolean>>
  homeDir: string
  onSystemThemeRefresh: () => void
  onTerminalPalette: (palette: TerminalPalette | null) => void
}

export function useAppBehaviors(options: UseAppBehaviorsOptions) {
  useSystemThemeFollow(options.config?.theme, options.homeDir, options.onSystemThemeRefresh)
  useTerminalPalette(options.config?.theme, options.onTerminalPalette)
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
  useProjectDiscoveryFailureMessages(options.setMessage)
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
  useHerdrAgentPolling(
    options.inventory,
    options.appMode,
    options.viewMode,
    options.config,
    options.backend
  )
}
