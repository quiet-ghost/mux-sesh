import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { loadConfig } from '../config'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import { resolveMultiplexerBackend, type MultiplexerBackend } from '../multiplexer'
import {
  getProjectSelectionIndex,
  getSessionSelectionIndex,
  loadProjectSourceItems,
  loadProjectItemsWithLinks,
  loadSessionItems,
  type Measure,
} from './data'

export interface RefreshedViewState {
  items: Item[]
  cursor: number
  sessionItems?: Item[]
  projectSourceItems?: Item[]
}

export async function loadRefreshedViewState(
  targetMode: ViewMode,
  config: Config,
  measure: Measure,
  backend: MultiplexerBackend,
  lastSessionSelection?: string | null,
  lastProjectSelection?: string | null
): Promise<RefreshedViewState> {
  if (targetMode === ViewMode.Sessions) {
    const { sessionItems } = await loadSessionItems(config, measure, backend, 'refresh')
    return {
      items: sessionItems,
      sessionItems,
      cursor: getSessionSelectionIndex(sessionItems, lastSessionSelection),
    }
  }

  const { visibleSessions } = await loadSessionItems(config, measure, backend, 'refresh-projects')
  const { projectSourceItems, projectItems } = await loadProjectItemsWithLinks(
    config,
    visibleSessions,
    measure
  )

  return {
    items: projectItems,
    projectSourceItems,
    cursor: getProjectSelectionIndex(projectItems, lastProjectSelection),
  }
}

export function applyRefreshedViewState(
  refreshedState: RefreshedViewState,
  setSessionItems: Dispatch<SetStateAction<Item[]>>,
  setProjectSourceItems: Dispatch<SetStateAction<Item[]>>,
  setAllItems: Dispatch<SetStateAction<Item[]>>,
  setItems: Dispatch<SetStateAction<Item[]>>,
  setCursor: Dispatch<SetStateAction<number>>
) {
  if (refreshedState.sessionItems) {
    setSessionItems(refreshedState.sessionItems)
  }

  if (refreshedState.projectSourceItems) {
    setProjectSourceItems(refreshedState.projectSourceItems)
  }

  setAllItems(refreshedState.items)
  setItems(refreshedState.items)
  setCursor(refreshedState.cursor)
}

export function useAppStartup(
  measure: Measure,
  lastSessionSelectionRef: MutableRefObject<string | null>,
  lastProjectSelectionRef: MutableRefObject<string | null>,
  mark: (label: string) => void,
  setConfig: Dispatch<SetStateAction<Config | null>>,
  setBackend: Dispatch<SetStateAction<MultiplexerBackend | null>>,
  setMessage: Dispatch<SetStateAction<string>>,
  setAppMode: Dispatch<SetStateAction<AppMode>>,
  setViewMode: Dispatch<SetStateAction<ViewMode>>,
  setSessionItems: Dispatch<SetStateAction<Item[]>>,
  setProjectSourceItems: Dispatch<SetStateAction<Item[]>>,
  setAllItems: Dispatch<SetStateAction<Item[]>>,
  setItems: Dispatch<SetStateAction<Item[]>>,
  setCursor: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    let cancelled = false

    async function init() {
      mark('startup begin')
      const config = await measure('loadConfig', loadConfig)
      if (cancelled) {
        return
      }

      const startupAppMode = config.keybindMode === 'standard' ? AppMode.Search : AppMode.Normal
      const backend = await measure('resolveBackend', () =>
        resolveMultiplexerBackend({ preference: config.backend })
      )
      if (cancelled) return
      setConfig(config)
      setBackend(backend)
      setAppMode(startupAppMode)

      const { visibleSessions, sessionItems } = await loadSessionItems(
        config,
        measure,
        backend,
        'startup'
      )
      if (cancelled) {
        return
      }

      setSessionItems(sessionItems)

      if (sessionItems.length > 0) {
        setViewMode(ViewMode.Sessions)
        setAllItems(sessionItems)
        setItems(sessionItems)
        setCursor(getSessionSelectionIndex(sessionItems, lastSessionSelectionRef.current))
        mark('startup complete')

        const projectSourceItems = await loadProjectSourceItems(config, measure)
        if (cancelled) {
          return
        }

        setProjectSourceItems(projectSourceItems)
        return
      }

      const { projectSourceItems, projectItems } = await loadProjectItemsWithLinks(
        config,
        visibleSessions,
        measure
      )
      if (cancelled) {
        return
      }

      setViewMode(ViewMode.Projects)
      setProjectSourceItems(projectSourceItems)
      setAllItems(projectItems)
      setItems(projectItems)
      setCursor(getProjectSelectionIndex(projectItems, lastProjectSelectionRef.current))
      mark('startup complete')
    }

    void init().catch(error => {
      if (!cancelled) {
        setMessage(error instanceof Error ? error.message : 'Failed to start mux-sesh')
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    lastProjectSelectionRef,
    lastSessionSelectionRef,
    mark,
    measure,
    setAllItems,
    setAppMode,
    setConfig,
    setBackend,
    setMessage,
    setCursor,
    setItems,
    setProjectSourceItems,
    setSessionItems,
    setViewMode,
  ])
}
