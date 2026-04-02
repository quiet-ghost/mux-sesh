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
