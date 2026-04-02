import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { loadConfig } from '../config'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import {
  getProjectSelectionIndex,
  getSessionSelectionIndex,
  loadProjectItemsWithLinks,
  loadSessionItems,
  type Measure,
} from './data'

export interface StartupState {
  config: Config
  appMode: AppMode
  viewMode: ViewMode
  items: Item[]
  sessionItems: Item[]
  projectSourceItems: Item[]
  cursor: number
}

export interface RefreshedViewState {
  items: Item[]
  cursor: number
  sessionItems?: Item[]
  projectSourceItems?: Item[]
}

export async function loadStartupState(
  measure: Measure,
  lastSessionSelection?: string | null,
  lastProjectSelection?: string | null
): Promise<StartupState> {
  const config = await measure('loadConfig', loadConfig)
  const { visibleSessions, sessionItems } = await loadSessionItems(config, measure, 'startup')
  const { projectSourceItems, projectItems } = await loadProjectItemsWithLinks(
    config,
    visibleSessions,
    measure
  )

  if (sessionItems.length > 0) {
    return {
      config,
      appMode: config.keybindMode === 'standard' ? AppMode.Search : AppMode.Normal,
      viewMode: ViewMode.Sessions,
      items: sessionItems,
      sessionItems,
      projectSourceItems,
      cursor: getSessionSelectionIndex(sessionItems, lastSessionSelection),
    }
  }

  return {
    config,
    appMode: config.keybindMode === 'standard' ? AppMode.Search : AppMode.Normal,
    viewMode: ViewMode.Projects,
    items: projectItems,
    sessionItems,
    projectSourceItems,
    cursor: getProjectSelectionIndex(projectItems, lastProjectSelection),
  }
}

export async function loadRefreshedViewState(
  targetMode: ViewMode,
  config: Config,
  measure: Measure,
  lastSessionSelection?: string | null,
  lastProjectSelection?: string | null
): Promise<RefreshedViewState> {
  if (targetMode === ViewMode.Sessions) {
    const { sessionItems } = await loadSessionItems(config, measure, 'refresh')
    return {
      items: sessionItems,
      sessionItems,
      cursor: getSessionSelectionIndex(sessionItems, lastSessionSelection),
    }
  }

  const { visibleSessions } = await loadSessionItems(config, measure, 'refresh-projects')
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
  setAppMode: Dispatch<SetStateAction<AppMode>>,
  setViewMode: Dispatch<SetStateAction<ViewMode>>,
  setSessionItems: Dispatch<SetStateAction<Item[]>>,
  setProjectSourceItems: Dispatch<SetStateAction<Item[]>>,
  setAllItems: Dispatch<SetStateAction<Item[]>>,
  setItems: Dispatch<SetStateAction<Item[]>>,
  setCursor: Dispatch<SetStateAction<number>>
) {
  useEffect(() => {
    async function init() {
      mark('startup begin')
      const startupState = await loadStartupState(
        measure,
        lastSessionSelectionRef.current,
        lastProjectSelectionRef.current
      )

      setConfig(startupState.config)
      setAppMode(startupState.appMode)
      setViewMode(startupState.viewMode)
      setSessionItems(startupState.sessionItems)
      setProjectSourceItems(startupState.projectSourceItems)
      setAllItems(startupState.items)
      setItems(startupState.items)
      setCursor(startupState.cursor)

      mark('startup complete')
    }

    void init()
  }, [
    lastProjectSelectionRef,
    lastSessionSelectionRef,
    mark,
    measure,
    setAllItems,
    setAppMode,
    setConfig,
    setCursor,
    setItems,
    setProjectSourceItems,
    setSessionItems,
    setViewMode,
  ])
}
