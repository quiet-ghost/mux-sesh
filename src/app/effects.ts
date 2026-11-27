import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { useRenderer } from '@opentui/react'
import type { TerminalColors } from '@opentui/core'
import { checkAndUpdate, updateEvents } from '../update'
import { createAutoUpdateScheduler, type AutoUpdateScheduler } from '../update/scheduler'
import { showTemporaryMessage, showTemporaryToast } from './notifications'
import { useHerdrAgentPolling } from './herdr-refresh'
import type { SessionInventory } from './session-inventory'
import { clearMatchIndices, createItemFilter, type ItemFilter } from '../search'
import { getSessionSelectionIndex } from './data'
import { SYSTEM_THEME_ID } from '../styles/theme'
import { subscribeThemeFollow, type SubscribeThemeFollowOptions } from '../styles/theme-follow'
import { terminalColorsToPalette, type TerminalPalette } from '../styles/terminal-palette'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey } from '../multiplexer/items'
import { describeDiscoveryFailures } from '../tmux/project-discovery-service'
import { subscribeProjectDiscoveryFailures } from '../tmux/projects'
import { clampCursorIndex } from '../ui/list-window'

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

    // A terminal that cannot report its palette keeps the built-in colors.
    renderer.getPalette().then(publish, () => {
      if (!cancelled) onPaletteRef.current(null)
    })

    renderer.on('palette', publish)

    return () => {
      cancelled = true
      renderer.off('palette', publish)
    }
  }, [renderer, themeId])
}

// Process-scoped so a retried or remounted app tree cannot start a second update check.
const AUTO_UPDATE_SCHEDULER = createAutoUpdateScheduler({
  delayMs: 1000,
  check: config => {
    checkAndUpdate(config).catch(error => {
      console.error('Auto-update check failed:', error)
    })
  },
})

export function useAutoUpdateScheduler(
  config: Config | null,
  scheduler: AutoUpdateScheduler = AUTO_UPDATE_SCHEDULER
) {
  useEffect(() => {
    if (!config) return

    return scheduler.schedule(config)
  }, [config, scheduler])
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

export function useSearchFiltering(
  appMode: AppMode,
  searchQuery: string,
  allItems: Item[],
  setItems: Dispatch<SetStateAction<Item[]>>,
  setCursor: Dispatch<SetStateAction<number>>,
  filterItems?: ItemFilter
) {
  // Owned per hook so typing refines the previous Search result instead of rescanning.
  const [ownFilter] = useState(() => createItemFilter())
  const filter = filterItems ?? ownFilter

  useEffect(() => {
    // New-session rows belong to useLauncherQuery, which merges native file search in.
    if (appMode !== AppMode.Search) {
      return
    }

    if (searchQuery.trim()) {
      setItems(filter(allItems, searchQuery))
      setCursor(0)

      return
    }

    setItems(allItems)
    setCursor(0)
  }, [allItems, appMode, filter, searchQuery, setCursor, setItems])
}

interface UseAppBehaviorsOptions {
  inventory: SessionInventory
  setMessage: Dispatch<SetStateAction<string>>
  appMode: AppMode
  viewMode: ViewMode
  config: Config | null
  backend: MultiplexerBackend | null
  sessionItems: Item[]
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
  searchQuery: string
  allItems: Item[]
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
  useProjectDiscoveryFailureMessages(options.setMessage)
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
  useSearchFiltering(
    options.appMode,
    options.searchQuery,
    options.allItems,
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
