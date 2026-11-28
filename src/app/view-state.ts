import { resolvePrefixKey } from '../config'
import { filterCommandEntries } from '../ui/CommandsModal'
import { filterSettingsEntries, filterSettingsOptions } from '../settings/settings-search'
import type { SettingsEntry, SettingsOption } from '../settings/settings-catalog'
import { getSettingOptions, getSettingsEntries, getSettingValue } from '../settings/settings-view'
import { IconsForm, type IconsFormEntry } from '../settings/settings-icons'
import { AppMode, ViewMode } from './app-mode'
import type { Config } from '../config/config-model'
import type { Item } from '../items/item'
import {
  getActionTarget,
  getCommandEntries,
  type ActionBackend,
  type ActionContext,
  type CommandEntry,
} from './action-catalog'
import type { ModalState } from './modals'
import { PendingClose } from './pending-close'
import { splitVisibleSessions } from './screen-layout'

const NO_MARKS: ReadonlyMap<string, Item> = new Map()

interface SessionCommandState {
  regularSessions: Item[]
  agentSessions: Item[]
  selectedAgentSession: Item | undefined
  selectedPrimaryItem: Item | undefined
  actionContext: ActionContext
  filteredCommandEntries: CommandEntry[]
}

interface SettingsState {
  filteredSettingsEntries: SettingsEntry[]
  filteredSettingOptions: SettingsOption[]
  savedSettingOption: string | undefined
  iconsFormEntries: IconsFormEntry[]
}

export function getSessionCommandState(
  appMode: AppMode,
  viewMode: ViewMode,
  items: Item[],
  cursor: number,
  agentCursor: number,
  config: Config | null,
  commandsSearchQuery: string,
  backend: ActionBackend | null = null,
  marked: ReadonlyMap<string, Item> = NO_MARKS,
  pendingClose: PendingClose = PendingClose.none
): SessionCommandState {
  const sessionSplit =
    viewMode === ViewMode.Sessions
      ? splitVisibleSessions(items)
      : { regularSessions: items, agentSessions: [] }

  const selectedPrimaryItem =
    viewMode === ViewMode.Sessions && appMode === AppMode.Normal
      ? sessionSplit.regularSessions[cursor]
      : viewMode === ViewMode.Sessions && appMode === AppMode.AgentsManage
        ? sessionSplit.agentSessions[agentCursor]
        : items[cursor]

  const actionContext: ActionContext = {
    appMode,
    viewMode,
    keybindMode: config?.keybindMode ?? 'vim',
    prefixKey: resolvePrefixKey(config),
    backend,
    agentCount: sessionSplit.agentSessions.length,
    target: getActionTarget(selectedPrimaryItem),
    marked,
    pendingClose,
  }

  return {
    // Search keeps a flat cursor shared by the visible list and command targets.
    regularSessions:
      appMode === AppMode.Normal || appMode === AppMode.AgentsManage
        ? sessionSplit.regularSessions
        : items,
    agentSessions: sessionSplit.agentSessions,
    selectedAgentSession:
      appMode === AppMode.AgentsManage ? sessionSplit.agentSessions[agentCursor] : undefined,
    selectedPrimaryItem,
    actionContext,
    filteredCommandEntries: filterCommandEntries(
      getCommandEntries(actionContext),
      commandsSearchQuery
    ),
  }
}

export function getSettingsState(
  config: Config | null,
  modalState: ModalState,
  settingsSearchQuery: string,
  settingOptionsSearchQuery: string,
  homeDir: string
): SettingsState {
  const settingsEntries = config ? getSettingsEntries(config, homeDir) : []
  const currentOptionField = modalState?.type === 'setting-options' ? modalState.field : undefined

  const settingOptions =
    config && currentOptionField ? getSettingOptions(config, currentOptionField) : []

  return {
    filteredSettingsEntries: filterSettingsEntries(settingsEntries, settingsSearchQuery),
    filteredSettingOptions: filterSettingsOptions(settingOptions, settingOptionsSearchQuery),
    savedSettingOption:
      config && currentOptionField ? getSettingValue(config, currentOptionField) : undefined,
    iconsFormEntries: config && modalState?.type === 'icons-form' ? IconsForm.entries(config) : [],
  }
}
