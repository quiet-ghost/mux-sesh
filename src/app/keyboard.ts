import { useKeyboard } from '@opentui/react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { handleModalKeyboard } from './modal-keyboard'
import type { ModalState } from './modals'
import {
  handleNewSessionMode,
  handleNormalMode,
  handleOpencodeManageMode,
  handleSearchMode,
  type KeyboardHandlerContext,
} from '../handlers/keyboard'
import type { SettingsEntry, SettingsFieldId, SettingsOption } from '../settings'
import type { Config, Item, OpencodeSessionStats } from '../types'
import type { CommandEntry } from '../ui/CommandsModal'
import { AppMode, ViewMode } from '../types'

interface UseAppKeyboardOptions {
  appMode: AppMode
  viewMode: ViewMode
  config: Config | null
  items: Item[]
  regularSessions: Item[]
  opencodeSessions: Item[]
  sessionItems: Item[]
  sessionCandidateItems: Item[]
  projectSourceItems: Item[]
  cursor: number
  opencodeCursor: number
  searchQuery: string
  prefixActive: boolean
  prefixTimeoutRef: MutableRefObject<NodeJS.Timeout | null>
  modalState: ModalState
  filteredCommandEntries: CommandEntry[]
  commandsCursor: number
  setCommandsCursor: Dispatch<SetStateAction<number>>
  filteredSettingsEntries: SettingsEntry[]
  settingsCursor: number
  setSettingsCursor: Dispatch<SetStateAction<number>>
  filteredSettingOptions: SettingsOption[]
  settingOptionsCursor: number
  setSettingOptionsCursor: Dispatch<SetStateAction<number>>
  setModalState: Dispatch<SetStateAction<ModalState>>
  setSettingEditorError: Dispatch<SetStateAction<string>>
  executeCommand: (id: CommandEntry['id']) => Promise<void>
  handleSettingOptionSubmit: (field: SettingsFieldId, value: string) => Promise<void>
  handleSettingsEditorSubmit: (field: SettingsFieldId) => Promise<void>
  handleRenameSubmit: () => Promise<void>
  handleNewSessionSubmit: () => Promise<void>
  isOptionSetting: (field: SettingsFieldId) => boolean
  openSettingOptions: (field: SettingsFieldId) => void
  openSettingEditor: (field: SettingsFieldId) => void
  closeModal: () => void
  clearPendingKill: () => void
  requestKillSession: (sessionName: string) => void
  openRenameModal: (sessionName: string) => void
  openCommandsModal: () => void
  openSettingsModal: () => void
  refreshItems: (forceViewMode?: ViewMode, nextConfig?: Config | null) => Promise<void>
  handleSelect: (item: Item) => Promise<void>
  handleKillSession: (sessionName: string) => Promise<void>
  handleLastSession: () => Promise<void>
  handleRootSession: (item?: Item) => Promise<void>
  handleEditTarget: (item?: Item) => Promise<void>
  loadOpencodeStatsForSession: (sessionName: string) => Promise<OpencodeSessionStats | null>
  setAppMode: Dispatch<SetStateAction<AppMode>>
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  setCursor: Dispatch<SetStateAction<number>>
  setOpencodeCursor: Dispatch<SetStateAction<number>>
  setSearchQuery: Dispatch<SetStateAction<string>>
  setAllItems: Dispatch<SetStateAction<Item[]>>
  setItems: Dispatch<SetStateAction<Item[]>>
  setPrefixActive: Dispatch<SetStateAction<boolean>>
  setMessage: Dispatch<SetStateAction<string>>
}

export function useAppKeyboard(options: UseAppKeyboardOptions) {
  const keyboardContext: KeyboardHandlerContext = {
    appMode: options.appMode,
    viewMode: options.viewMode,
    items: options.items,
    regularSessions: options.regularSessions,
    opencodeSessions: options.opencodeSessions,
    cursor: options.cursor,
    opencodeCursor: options.opencodeCursor,
    searchQuery: options.searchQuery,
    prefixKey: options.config?.prefixKey,
    projectItems:
      options.sessionCandidateItems.length > 0
        ? options.sessionCandidateItems
        : options.projectSourceItems,
    sessionItems: options.sessionItems,
    prefixActive: options.prefixActive,
    prefixTimeoutRef: options.prefixTimeoutRef,
    setAppMode: options.setAppMode,
    setViewMode: options.setViewMode,
    setCursor: options.setCursor,
    setOpencodeCursor: options.setOpencodeCursor,
    setSearchQuery: options.setSearchQuery,
    setAllItems: options.setAllItems,
    setItems: options.setItems,
    setPrefixActive: options.setPrefixActive,
    refreshItems: options.refreshItems,
    requestKillSession: options.requestKillSession,
    clearPendingKill: options.clearPendingKill,
    handleSelect: options.handleSelect,
    handleKillSession: options.handleKillSession,
    handleLastSession: options.handleLastSession,
    handleRootSession: options.handleRootSession,
    handleEditTarget: options.handleEditTarget,
    openRenameModal: options.openRenameModal,
    openCommandsModal: options.openCommandsModal,
    openSettingsModal: options.openSettingsModal,
    loadOpencodeStatsForSession: options.loadOpencodeStatsForSession,
    setMessage: options.setMessage,
  }

  useKeyboard(key => {
    const keybindMode = options.config?.keybindMode || 'vim'

    if (
      handleModalKeyboard(key, {
        modalState: options.modalState,
        filteredCommandEntries: options.filteredCommandEntries,
        commandsCursor: options.commandsCursor,
        setCommandsCursor: options.setCommandsCursor,
        filteredSettingsEntries: options.filteredSettingsEntries,
        settingsCursor: options.settingsCursor,
        setSettingsCursor: options.setSettingsCursor,
        filteredSettingOptions: options.filteredSettingOptions,
        settingOptionsCursor: options.settingOptionsCursor,
        setSettingOptionsCursor: options.setSettingOptionsCursor,
        closeModal: options.closeModal,
        openSettingOptions: options.openSettingOptions,
        openSettingEditor: options.openSettingEditor,
        isOptionSetting: options.isOptionSetting,
        setModalState: options.setModalState,
        setSettingEditorError: options.setSettingEditorError,
        executeCommand: options.executeCommand,
        handleSettingOptionSubmit: options.handleSettingOptionSubmit,
        handleSettingsEditorSubmit: options.handleSettingsEditorSubmit,
        handleRenameSubmit: options.handleRenameSubmit,
      })
    ) {
      return
    }

    if (options.appMode === AppMode.Normal) {
      handleNormalMode(key, keyboardContext, keybindMode)
    } else if (options.appMode === AppMode.Search) {
      handleSearchMode(key, keyboardContext, keybindMode)
    } else if (options.appMode === AppMode.NewSession) {
      if (key.name === 'return') {
        void options.handleNewSessionSubmit()
      } else {
        handleNewSessionMode(key, keyboardContext, keybindMode)
      }
    } else if (options.appMode === AppMode.OpencodeManage) {
      handleOpencodeManageMode(key, keyboardContext, keybindMode)
    }
  })
}
