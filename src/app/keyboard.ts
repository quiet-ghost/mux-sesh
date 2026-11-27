import { useKeyboard } from '@opentui/react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { ActionOwner } from './action-owner'
import type { OperationReport } from './action-outcome'
import { FocusOwner } from './focus-owner'
import { handleModalKeyboard } from './modal-keyboard'
import type { NewSessionStepControls } from './new-session-step'
import type { ModalState } from './modals'
import type { CleanupBatch, CloseReceipt } from '../sessions/cleanup-batch'
import type { CleanupPlan } from '../sessions/cleanup-plan'
import {
  handleNewSessionMode,
  handleNormalMode,
  handleAgentsManageMode,
  handleSearchMode,
  type KeyboardHandlerContext,
} from '../handlers/keyboard'
import { resolvePrefixKey } from '../config'
import type { SettingsEntry, SettingsFieldId, SettingsOption } from '../settings'
import type { Config, Item } from '../types'
import type { CommandEntry } from '../ui/CommandsModal'
import type { ActionContext } from './action-catalog'
import { failureKind } from './action-outcome'
import type { ShowToast } from './notifications'
import { AppMode, ViewMode } from '../types'

interface UseAppKeyboardOptions {
  // False while another screen (e.g. startup failure) owns the keyboard.
  active: boolean
  appMode: AppMode
  viewMode: ViewMode
  config: Config | null
  items: Item[]
  regularSessions: Item[]
  agentSessions: Item[]
  sessionItems: Item[]
  sessionCandidateItems: Item[]
  projectSourceItems: Item[]
  cursor: number
  agentCursor: number
  searchQuery: string
  actionContext: ActionContext
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
  newSession: NewSessionStepControls
  handleOutcomeRetry: (report: OperationReport) => Promise<void>
  confirmCloseReview: (plan: CleanupPlan) => Promise<void>
  confirmBatchClose: (batch: CleanupBatch) => Promise<void>
  retryBatchClose: (receipt: CloseReceipt) => Promise<void>
  // Crash recovery for defects raised by key handlers; production passes requestFatalShutdown.
  onDefect: (cause: unknown) => void
  isOptionSetting: (field: SettingsFieldId) => boolean
  openSettingOptions: (field: SettingsFieldId) => void
  openSettingEditor: (field: SettingsFieldId) => void
  closeModal: () => void
  requestKillSession: (item: Item) => void
  requestMarkedClose: () => Promise<void>
  toggleMark: (item: Item) => void
  togglePinnedSession: (sessionName: string) => Promise<void>
  openRenameModal: (item: Item) => void
  openCommandsModal: () => void
  toggleDetails: () => void
  openSettingsModal: () => void
  refreshItems: (forceViewMode?: ViewMode, nextConfig?: Config | null) => Promise<void>
  refreshList: () => Promise<void>
  handleSelect: (item: Item) => Promise<void>
  launchPlanned: () => Promise<void>
  handleLastSession: () => Promise<void>
  handleRootSession: (item?: Item) => Promise<void>
  handleEditTarget: (item?: Item) => Promise<void>
  setAppMode: Dispatch<SetStateAction<AppMode>>
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  setCursor: Dispatch<SetStateAction<number>>
  setAgentCursor: Dispatch<SetStateAction<number>>
  setSearchQuery: Dispatch<SetStateAction<string>>
  setAllItems: Dispatch<SetStateAction<Item[]>>
  setItems: Dispatch<SetStateAction<Item[]>>
  setPrefixActive: Dispatch<SetStateAction<boolean>>
  showToast: ShowToast
  acknowledgeToast: () => void
}

export function useAppKeyboard(options: UseAppKeyboardOptions) {
  const owner = ActionOwner.create({
    report: cause => options.showToast({ kind: failureKind(cause), message: cause.message }),
    onDefect: options.onDefect,
  })

  const keyboardContext: KeyboardHandlerContext = {
    runAction: owner.run,
    appMode: options.appMode,
    viewMode: options.viewMode,
    items: options.items,
    regularSessions: options.regularSessions,
    agentSessions: options.agentSessions,
    cursor: options.cursor,
    agentCursor: options.agentCursor,
    searchQuery: options.searchQuery,
    actionContext: options.actionContext,
    prefixKey: resolvePrefixKey(options.config),
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
    setAgentCursor: options.setAgentCursor,
    setSearchQuery: options.setSearchQuery,
    setAllItems: options.setAllItems,
    setItems: options.setItems,
    setPrefixActive: options.setPrefixActive,
    refreshItems: options.refreshItems,
    refreshList: options.refreshList,
    requestKillSession: options.requestKillSession,
    requestMarkedClose: options.requestMarkedClose,
    toggleMark: options.toggleMark,
    togglePinnedSession: options.togglePinnedSession,
    handleSelect: options.handleSelect,
    launchPlanned: options.launchPlanned,
    handleLastSession: options.handleLastSession,
    handleRootSession: options.handleRootSession,
    handleEditTarget: options.handleEditTarget,
    openRenameModal: options.openRenameModal,
    openCommandsModal: options.openCommandsModal,
    toggleDetails: options.toggleDetails,
    openSettingsModal: options.openSettingsModal,
    showToast: options.showToast,
  }

  // The renderer only logs errors thrown from key callbacks, so the owner routes them instead.
  useKeyboard(key => owner.run(() => handleKey(key, options, keyboardContext, owner)))
}

type AppKey = Parameters<Parameters<typeof useKeyboard>[0]>[0]

function handleKey(
  key: AppKey,
  options: UseAppKeyboardOptions,
  keyboardContext: KeyboardHandlerContext,
  owner: ActionOwner
): void {
  if (!options.active) return

  options.acknowledgeToast()

  const keybindMode = options.config?.keybindMode || 'vim'
  const focus = FocusOwner.of(options)

  if (focus.kind === 'modal') {
    const consumed = handleModalKeyboard(key, {
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
      runAction: owner.run,
      executeCommand: options.executeCommand,
      showToast: options.showToast,
      handleSettingOptionSubmit: options.handleSettingOptionSubmit,
      handleSettingsEditorSubmit: options.handleSettingsEditorSubmit,
      handleRenameSubmit: options.handleRenameSubmit,
      handleOutcomeRetry: options.handleOutcomeRetry,
      confirmCloseReview: options.confirmCloseReview,
      confirmBatchClose: options.confirmBatchClose,
      retryBatchClose: options.retryBatchClose,
    })

    if (consumed) key.preventDefault()

    return
  }

  let consumed = false

  if (options.appMode === AppMode.Normal) {
    handleNormalMode(key, keyboardContext, keybindMode)
  } else if (options.appMode === AppMode.Search) {
    consumed = handleSearchMode(key, keyboardContext, keybindMode)
  } else if (options.appMode === AppMode.NewSession) {
    consumed = handleNewSessionMode(key, keyboardContext, keybindMode, options.newSession)
  } else if (options.appMode === AppMode.AgentsManage) {
    handleAgentsManageMode(key, keyboardContext, keybindMode)
  }

  // A consumed key must not also edit the search text.
  if (consumed && focus.kind === 'search-field') key.preventDefault()
}
