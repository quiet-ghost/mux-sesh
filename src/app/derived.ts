import { filterCommandEntries, getCommandEntries, type CommandEntry } from '../ui/CommandsModal'
import {
  filterSettingsEntries,
  filterSettingsOptions,
  getSettingsEntries,
  getSettingOptions,
  type SettingsEntry,
  type SettingsOption,
} from '../settings'
import { AppMode, ViewMode, type Config, type Item } from '../types'
import type { ModalState } from './modals'
import { splitVisibleSessions } from './view'

interface SessionCommandState {
  regularSessions: Item[]
  agentSessions: Item[]
  selectedAgentSessionName: string | undefined
  selectedPrimaryItem: Item | undefined
  filteredCommandEntries: CommandEntry[]
}

interface SettingsState {
  filteredSettingsEntries: SettingsEntry[]
  filteredSettingOptions: SettingsOption[]
}

export function getSessionCommandState(
  appMode: AppMode,
  viewMode: ViewMode,
  items: Item[],
  cursor: number,
  agentCursor: number,
  config: Config | null,
  commandsSearchQuery: string
): SessionCommandState {
  const sessionSplit =
    viewMode === ViewMode.Sessions &&
    (appMode === AppMode.Normal || appMode === AppMode.AgentsManage)
      ? splitVisibleSessions(items)
      : { regularSessions: items, agentSessions: [] }

  const selectedPrimaryItem =
    viewMode === ViewMode.Sessions && appMode === AppMode.Normal
      ? sessionSplit.regularSessions[cursor]
      : viewMode === ViewMode.Sessions && appMode === AppMode.AgentsManage
        ? sessionSplit.agentSessions[agentCursor]
        : items[cursor]

  return {
    regularSessions: sessionSplit.regularSessions,
    agentSessions: sessionSplit.agentSessions,
    selectedAgentSessionName:
      appMode === AppMode.AgentsManage ? sessionSplit.agentSessions[agentCursor]?.title : undefined,
    selectedPrimaryItem,
    filteredCommandEntries: filterCommandEntries(
      getCommandEntries(appMode, config?.keybindMode, config?.prefixKey, selectedPrimaryItem),
      commandsSearchQuery
    ),
  }
}

export function getSettingsState(
  config: Config | null,
  modalState: ModalState,
  settingsSearchQuery: string,
  settingOptionsSearchQuery: string
): SettingsState {
  const settingsEntries = config ? getSettingsEntries(config) : []
  const currentOptionField = modalState?.type === 'setting-options' ? modalState.field : undefined
  const settingOptions =
    config && currentOptionField ? getSettingOptions(config, currentOptionField) : []

  return {
    filteredSettingsEntries: filterSettingsEntries(settingsEntries, settingsSearchQuery),
    filteredSettingOptions: filterSettingsOptions(settingOptions, settingOptionsSearchQuery),
  }
}
