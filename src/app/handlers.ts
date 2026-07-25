import { executeCommand as runCommand } from './commands'
import { persistConfigUpdate, runWithErrorMessage } from './operations'
import { AppMode, type Config, type Item, type OpencodeSessionStats, type ViewMode } from '../types'
import type { SettingsFieldId } from '../settings'
import type { MultiplexerBackend } from '../multiplexer'
import { applyEditorSetting, applyOptionSetting, getSettingEditorTitle } from '../settings'
import {
  handleEditTarget as actionHandleEditTarget,
  handleKillSession as actionHandleKillSession,
  handleLastSession as actionHandleLastSession,
  handleNewSessionSubmit as actionHandleNewSessionSubmit,
  handleRenameSubmit as actionHandleRenameSubmit,
  handleRootSession as actionHandleRootSession,
  handleSelect as actionHandleSelect,
} from '../handlers/actions'

type ShowMessage = (message: string, timeout?: number) => void

interface SharedHandlerOptions {
  backend: MultiplexerBackend | null
  config: Config | null
  items: Item[]
  sessionItems: Item[]
  cursor: number
  showMessage: ShowMessage
  refreshItems: (forceViewMode?: ViewMode, nextConfig?: Config | null) => Promise<void>
}

interface KillHandlerOptions extends SharedHandlerOptions {
  setPendingKillSessionName: (sessionName: string | null) => void
}

interface SettingsHandlerOptions {
  config: Config | null
  saveConfig: (config: Config) => Promise<void>
  setConfig: (config: Config) => void
  setSettingEditorError: (message: string) => void
  openSettingsModal: () => void
  settingEditorValue: string
  settingEditorPlainText?: string
  refreshItems: (forceViewMode?: ViewMode, nextConfig?: Config | null) => Promise<void>
  showMessage: ShowMessage
}

export async function handleKillSessionWithFeedback(
  item: Item,
  options: KillHandlerOptions
): Promise<void> {
  options.setPendingKillSessionName(null)

  if (!options.backend) return
  await actionHandleKillSession(item, options.backend, {
    onSuccess: msg => options.showMessage(msg),
    onError: msg => options.showMessage(msg, 3000),
    refreshItems: () => options.refreshItems(),
  })
}

export async function handleSelectItem(
  item: Item,
  config: Config | null,
  backend: MultiplexerBackend | null
): Promise<void> {
  if (!backend) return
  await actionHandleSelect(item, config, backend)
}

export async function handleLastSessionWithFeedback(options: SharedHandlerOptions): Promise<void> {
  if (!options.backend) return
  const backend = options.backend
  await runWithErrorMessage(
    () => actionHandleLastSession(options.sessionItems, backend),
    'Failed to switch to the previous session',
    options.showMessage
  )
}

export async function handleRootSessionWithFeedback(
  item: Item | undefined,
  options: SharedHandlerOptions
): Promise<void> {
  if (!options.backend) return
  const backend = options.backend
  await runWithErrorMessage(
    () => actionHandleRootSession(item, options.config, backend),
    'Failed to open the root session',
    options.showMessage
  )
}

export async function handleEditTargetWithFeedback(
  item: Item | undefined,
  options: SharedHandlerOptions
): Promise<void> {
  if (!options.backend) return
  const backend = options.backend
  await runWithErrorMessage(
    () => actionHandleEditTarget(item, options.config, backend),
    'Failed to edit target',
    options.showMessage
  )
}

export async function handleRenameSubmitWithFeedback(
  renameTarget: Item | null,
  newName: string,
  closeModal: () => void,
  options: Pick<SharedHandlerOptions, 'backend' | 'showMessage' | 'refreshItems'>
): Promise<void> {
  if (renameTarget && newName && newName !== renameTarget.title && options.backend) {
    await actionHandleRenameSubmit(renameTarget, newName, options.backend, {
      onSuccess: msg => options.showMessage(msg),
      onError: msg => options.showMessage(msg, 3000),
      refreshItems: () => options.refreshItems(),
    })
  }

  closeModal()
}

export async function handleNewSessionSubmitWithSearch(
  searchTerm: string,
  options: SharedHandlerOptions
): Promise<void> {
  if (!searchTerm) {
    return
  }
  if (!options.backend) return
  const backend = options.backend

  await runWithErrorMessage(
    () =>
      actionHandleNewSessionSubmit(
        searchTerm,
        options.config,
        options.items,
        options.cursor,
        backend
      ),
    'Failed to create session',
    options.showMessage
  )
}

export async function handleSettingsEditorSubmitWithFeedback(
  field: SettingsFieldId,
  options: SettingsHandlerOptions
): Promise<void> {
  if (!options.config) {
    return
  }

  try {
    const rawText = options.settingEditorPlainText ?? options.settingEditorValue
    const nextConfig = applyEditorSetting(options.config, field, rawText, process.env.HOME || '~')

    options.setSettingEditorError('')
    await persistConfigUpdate(
      nextConfig,
      `${getSettingEditorTitle(field)} updated`,
      options.saveConfig,
      options.setConfig,
      options.refreshItems,
      options.showMessage
    )
    options.openSettingsModal()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to save settings'
    options.setSettingEditorError(errorMessage)
  }
}

export async function handleSettingOptionSubmitWithFeedback(
  field: SettingsFieldId,
  value: string,
  options: SettingsHandlerOptions
): Promise<void> {
  if (!options.config) {
    return
  }

  const nextConfig = applyOptionSetting(options.config, field, value)
  await persistConfigUpdate(
    nextConfig,
    `${getSettingEditorTitle(field)} updated`,
    options.saveConfig,
    options.setConfig,
    options.refreshItems,
    options.showMessage
  )
}

export function getPinnedSessionsAfterToggle(config: Config, sessionName: string): string[] {
  const pinnedSessions = config.pinnedSessions ?? []

  return pinnedSessions.includes(sessionName)
    ? pinnedSessions.filter(pinnedSession => pinnedSession !== sessionName)
    : [...pinnedSessions, sessionName]
}

export async function handleTogglePinnedSessionWithFeedback(
  sessionName: string,
  options: SettingsHandlerOptions
): Promise<void> {
  if (!options.config) {
    return
  }

  const pinnedSessions = getPinnedSessionsAfterToggle(options.config, sessionName)
  const nextConfig = {
    ...options.config,
    pinnedSessions,
  }
  const isPinned = pinnedSessions.includes(sessionName)

  await persistConfigUpdate(
    nextConfig,
    `Session '${sessionName}' ${isPinned ? 'pinned' : 'unpinned'}`,
    options.saveConfig,
    options.setConfig,
    options.refreshItems,
    options.showMessage
  )
}

export async function executeAppCommand(
  commandID: Parameters<typeof runCommand>[0],
  options: Parameters<typeof runCommand>[1]
): Promise<void> {
  await runCommand(commandID, options)
}

interface CreateAppHandlersOptions extends SharedHandlerOptions {
  appMode: AppMode
  viewMode: ViewMode
  agentCursor: number
  regularSessions: Item[]
  agentSessions: Item[]
  selectedPrimaryItem?: Item
  sessionCandidateItems: Item[]
  projectSourceItems: Item[]
  closeModal: () => void
  openRenameModal: (item: Item) => void
  openSettingsModal: () => void
  requestKillSession: (item: Item) => void
  setAppMode: (mode: AppMode) => void
  setViewMode: (mode: ViewMode) => void
  setAllItems: (items: Item[]) => void
  setItems: (items: Item[]) => void
  setCursor: (cursor: number) => void
  setSearchQuery: (value: string) => void
  setAgentCursor: (cursor: number) => void
  setPendingKillSessionName: (sessionName: string | null) => void
  saveConfig: (config: Config) => Promise<void>
  setConfig: (config: Config) => void
  setSettingEditorError: (message: string) => void
  settingEditorValue: string
  settingEditorPlainText?: string
  renameTarget: Item | null
  renamedValue: string
  searchTerm: string
  loadOpencodeStatsForSession: (sessionName: string) => Promise<OpencodeSessionStats | null>
}

export function createAppHandlers(options: CreateAppHandlersOptions) {
  const sharedOptions: SharedHandlerOptions = {
    backend: options.backend,
    config: options.config,
    items: options.items,
    sessionItems: options.sessionItems,
    cursor: options.cursor,
    showMessage: options.showMessage,
    refreshItems: options.refreshItems,
  }

  async function handleKillSessionWrapper(item: Item) {
    await handleKillSessionWithFeedback(item, {
      ...sharedOptions,
      setPendingKillSessionName: options.setPendingKillSessionName,
    })
  }

  async function handleSelectWrapper(item: Item) {
    await handleSelectItem(item, options.config, options.backend)
  }

  async function handleLastSessionWrapper() {
    await handleLastSessionWithFeedback(sharedOptions)
  }

  async function handleRootSessionWrapper(item?: Item) {
    await handleRootSessionWithFeedback(item, sharedOptions)
  }

  async function handleEditTargetWrapper(item?: Item) {
    await handleEditTargetWithFeedback(item, sharedOptions)
  }

  async function handleRenameSubmit() {
    await handleRenameSubmitWithFeedback(
      options.renameTarget,
      options.renamedValue,
      options.closeModal,
      sharedOptions
    )
  }

  async function handleNewSessionSubmit() {
    await handleNewSessionSubmitWithSearch(options.searchTerm, sharedOptions)
  }

  async function handleSettingsEditorSubmit(field: SettingsFieldId) {
    await handleSettingsEditorSubmitWithFeedback(field, {
      config: options.config,
      saveConfig: options.saveConfig,
      setConfig: options.setConfig,
      setSettingEditorError: options.setSettingEditorError,
      openSettingsModal: options.openSettingsModal,
      settingEditorValue: options.settingEditorValue,
      settingEditorPlainText: options.settingEditorPlainText,
      refreshItems: options.refreshItems,
      showMessage: options.showMessage,
    })
  }

  async function handleSettingOptionSubmit(field: SettingsFieldId, value: string) {
    await handleSettingOptionSubmitWithFeedback(field, value, {
      config: options.config,
      saveConfig: options.saveConfig,
      setConfig: options.setConfig,
      setSettingEditorError: options.setSettingEditorError,
      openSettingsModal: options.openSettingsModal,
      settingEditorValue: options.settingEditorValue,
      refreshItems: options.refreshItems,
      showMessage: options.showMessage,
    })
  }

  async function handleTogglePinnedSessionWrapper(sessionName: string) {
    await handleTogglePinnedSessionWithFeedback(sessionName, {
      config: options.config,
      saveConfig: options.saveConfig,
      setConfig: options.setConfig,
      setSettingEditorError: options.setSettingEditorError,
      openSettingsModal: options.openSettingsModal,
      settingEditorValue: options.settingEditorValue,
      refreshItems: options.refreshItems,
      showMessage: options.showMessage,
    })
  }

  async function executeCommand(commandID: Parameters<typeof executeAppCommand>[0]) {
    await executeAppCommand(commandID, {
      appMode: options.appMode,
      viewMode: options.viewMode,
      cursor: options.cursor,
      agentCursor: options.agentCursor,
      regularSessions: options.regularSessions,
      agentSessions: options.agentSessions,
      selectedPrimaryItem: options.selectedPrimaryItem,
      sessionCandidateItems: options.sessionCandidateItems,
      projectSourceItems: options.projectSourceItems,
      closeModal: options.closeModal,
      openRenameModal: options.openRenameModal,
      openSettingsModal: options.openSettingsModal,
      requestKillSession: options.requestKillSession,
      togglePinnedSession: handleTogglePinnedSessionWrapper,
      setAppMode: options.setAppMode,
      setViewMode: options.setViewMode,
      setAllItems: options.setAllItems,
      setItems: options.setItems,
      setCursor: options.setCursor,
      setSearchQuery: options.setSearchQuery,
      setAgentCursor: options.setAgentCursor,
      refreshItems: forceViewMode => options.refreshItems(forceViewMode),
      handleLastSession: handleLastSessionWrapper,
      handleRootSession: handleRootSessionWrapper,
      handleEditTarget: handleEditTargetWrapper,
      loadOpencodeStatsForSession: options.loadOpencodeStatsForSession,
      showMessage: options.showMessage,
    })
  }

  return {
    handleKillSessionWrapper,
    handleSelectWrapper,
    handleLastSessionWrapper,
    handleRootSessionWrapper,
    handleEditTargetWrapper,
    handleRenameSubmit,
    handleNewSessionSubmit,
    handleSettingsEditorSubmit,
    handleSettingOptionSubmit,
    handleTogglePinnedSessionWrapper,
    executeCommand,
  }
}
