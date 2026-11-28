import {
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { describeUpdateEvent } from '../update'
import type { AutoUpdateScheduler } from '../update/scheduler'
import type { ShowToast } from './notifications'
import { PendingClose } from './pending-close'
import { useHerdrAgentPolling } from './herdr-refresh'
import type { SessionInventory } from './session-inventory'
import { clearMatchIndices, type ItemFilter } from '../search'
import type { OpenHistory } from '../search/frecency-store'
import { getSessionSelectionIndex } from './inventory-load'
import { AppMode, ViewMode } from './app-mode'
import type { Config } from '../config/config-model'
import type { Item } from '../items/item'
import type { MultiplexerBackend } from '../multiplexer'
import { getItemKey } from '../multiplexer/items'
import { describeDiscoveryFailures, type ProjectDiscovery } from '../projects/discovery-service'
import { clampCursorIndex } from '../ui/list-window'
import { useStartOnCurrentSession } from './start-cursor'
import type { AppServices, UpdateEventSource } from './app-services'

type AppBehaviorServices = Pick<
  AppServices,
  'openHistory' | 'createSearchFilter' | 'updates' | 'projects' | 'onDefect'
>

export function useAutoUpdateScheduler(config: Config | null, scheduler: AutoUpdateScheduler) {
  useEffect(() => {
    if (!config) return

    return scheduler.schedule(config)
  }, [config, scheduler])
}

function useUpdateEventToasts(
  setUpdatedVersion: Dispatch<SetStateAction<string | null>>,
  showToast: ShowToast,
  updates: UpdateEventSource
) {
  useEffect(() => {
    const unsubscribe = updates.on(event => {
      if (event.kind === 'updated') setUpdatedVersion(event.version)

      showToast(describeUpdateEvent(event))
    })

    return unsubscribe
  }, [setUpdatedVersion, showToast, updates])
}

function useNormalModeSessionReset(
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

function useProjectDiscoveryFailureToasts(showToast: ShowToast, projects: ProjectDiscovery) {
  useEffect(
    () =>
      projects.subscribeFailures(failures => {
        showToast({ kind: 'error', message: describeDiscoveryFailures(failures) })
      }),
    [projects, showToast]
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

function useSelectionMemory(
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

function useSearchFiltering(
  appMode: AppMode,
  searchQuery: string,
  allItems: Item[],
  setItems: Dispatch<SetStateAction<Item[]>>,
  setCursor: Dispatch<SetStateAction<number>>,
  createFilter: () => ItemFilter
) {
  // Owned per hook so typing refines the previous Search result instead of rescanning.
  const [filter] = useState(createFilter)

  useEffect(() => {
    const query = searchQuery.trim()

    // Agents opened from a search keep the query, and refreshes republish the full inventory, so
    // the list stays filtered. The search cursor is left where it was for the return to Search.
    if (appMode === AppMode.AgentsManage && query) {
      setItems(filter(allItems, searchQuery))

      return
    }

    // New-session rows belong to useLauncherQuery, which merges native file search in.
    if (appMode !== AppMode.Search) {
      return
    }

    if (query) {
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
function useOpenHistory(
  config: Config | null,
  history: OpenHistory,
  onDefect: (cause: unknown) => void
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
  services: AppBehaviorServices
}

export function useAppBehaviors(options: UseAppBehaviorsOptions) {
  useUpdateEventToasts(options.setUpdatedVersion, options.showToast, options.services.updates)
  useNormalModeSessionReset(
    options.appMode,
    options.viewMode,
    options.sessionItems,
    options.lastSessionSelectionRef,
    options.setAllItems,
    options.setItems,
    options.setCursor
  )
  useProjectDiscoveryFailureToasts(options.showToast, options.services.projects)
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
  useOpenHistory(options.config, options.services.openHistory, options.services.onDefect)
  useSearchFiltering(
    options.appMode,
    options.searchQuery,
    options.allItems,
    options.setItems,
    options.setCursor,
    options.services.createSearchFilter
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
