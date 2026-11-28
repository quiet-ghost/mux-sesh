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
import { checkAndUpdate, describeUpdateEvent, updateEvents } from '../update'
import { createAutoUpdateScheduler, type AutoUpdateScheduler } from '../update/scheduler'
import type { ShowToast } from './notifications'
import { PendingClose } from './pending-close'
import { useHerdrAgentPolling } from './herdr-refresh'
import type { SessionInventory } from './session-inventory'
import { clearMatchIndices, createItemFilter, type ItemFilter } from '../search'
import { OPEN_HISTORY, type OpenHistory } from '../search/frecency-store'
import { requestFatalShutdown } from '../lifecycle/shutdown'
import { getSessionSelectionIndex } from './inventory-load'
import { SYSTEM_THEME_ID } from '../styles/theme'
import { subscribeThemeFollow, type SubscribeThemeFollowOptions } from '../styles/theme-follow'
import { terminalColorsToPalette, type TerminalPalette } from '../styles/terminal-palette'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey } from '../multiplexer/items'
import { describeDiscoveryFailures } from '../projects/discovery-service'
import { subscribeProjectDiscoveryFailures } from '../projects/project-items'
import { clampCursorIndex } from '../ui/list-window'
import { useStartOnCurrentSession } from './start-cursor'

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

function useUpdateEventToasts(
  setUpdatedVersion: Dispatch<SetStateAction<string | null>>,
  showToast: ShowToast
) {
  useEffect(() => {
    const unsubscribe = updateEvents.on(event => {
      if (event.kind === 'updated') setUpdatedVersion(event.version)

      showToast(describeUpdateEvent(event))
    })

    return unsubscribe
  }, [setUpdatedVersion, showToast])
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

function useProjectDiscoveryFailureToasts(showToast: ShowToast) {
  useEffect(
    () =>
      subscribeProjectDiscoveryFailures(failures => {
        showToast({ kind: 'error', message: describeDiscoveryFailures(failures) })
      }),
    [showToast]
  )
}

function useBoundedCursor(length: number, setCursor: Dispatch<SetStateAction<number>>) {
  useEffect(() => {
    if (length === 0) {
      setCursor(0)

      return
    }

    setCursor(current => clampCursorIndex(length, current))
  }, [length, setCursor])
}

// A waiting close belongs to the row it was armed on, on the list itself: a refresh or view change
// that puts another row under the cursor, or a dialog opening over the list, cancels it.
export function usePendingCloseReset(
  pendingClose: PendingClose,
  target: Item | undefined,
  modalOpen: boolean,
  setPendingClose: Dispatch<SetStateAction<PendingClose>>
) {
  const armedKey = PendingClose.keyOf(pendingClose)
  const targetKey = target && getItemKey(target)

  useEffect(() => {
    if (armedKey === undefined || (!modalOpen && targetKey === armedKey)) return

    setPendingClose(PendingClose.none)
  }, [armedKey, modalOpen, setPendingClose, targetKey])
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
  const [ownFilter] = useState(() => createItemFilter({ boost: item => OPEN_HISTORY.boost(item) }))
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

// History follows config and loads on a later task, so its read never joins a frame. A query typed
// before it finishes ranks without history; nothing is reordered under the user when it lands.
export function useOpenHistory(
  config: Config | null,
  history: OpenHistory = OPEN_HISTORY,
  onDefect: (cause: unknown) => void = requestFatalShutdown
) {
  const enabled = config ? config.searchHistory !== false : undefined

  useEffect(() => {
    if (enabled === undefined) return

    history.configure(enabled)

    if (!enabled) return

    const timer = setTimeout(() => {
      history.load().catch(onDefect)
    }, 0)

    return () => clearTimeout(timer)
  }, [enabled, history, onDefect])
}

interface UseAppBehaviorsOptions {
  inventory: SessionInventory
  showToast: ShowToast
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
  regularSessions: Item[]
  searchQuery: string
  allItems: Item[]
  setUpdatedVersion: Dispatch<SetStateAction<string | null>>
}

export function useAppBehaviors(options: UseAppBehaviorsOptions) {
  useUpdateEventToasts(options.setUpdatedVersion, options.showToast)
  useNormalModeSessionReset(
    options.appMode,
    options.viewMode,
    options.sessionItems,
    options.lastSessionSelectionRef,
    options.setAllItems,
    options.setItems,
    options.setCursor
  )
  useProjectDiscoveryFailureToasts(options.showToast)
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
  useOpenHistory(options.config)
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
  useStartOnCurrentSession(options)
}
