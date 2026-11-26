import { executeCommand as runCommand } from './commands'
import {
  ActionOutcome,
  isExpectedActionFailure,
  type OperationReport,
  type OutcomePresenter,
} from './action-outcome'
import { persistConfigUpdate, runWithErrorMessage } from './operations'
import { AppMode, type Config, type Item, type ViewMode } from '../types'
import type { SettingsFieldId } from '../settings'
import type { MultiplexerBackend } from '../multiplexer'
import { handoffOf } from '../multiplexer/focus-outcome'
import type { FocusOutcome, WorkspaceRef } from '../multiplexer/types'
import type { LaunchPreview } from '../sessions/launch-plan'
import { requestShutdown } from '../util/shutdown'
import { movePinAfterRename } from '../config/pinned-sessions'
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

// One per picker: a second Enter while a launch runs must not start an overlapping mutation.
export interface LaunchGuard {
  active: boolean
}

interface NewSessionHandlerOptions extends Pick<
  SharedHandlerOptions,
  'backend' | 'config' | 'sessionItems' | 'showMessage' | 'refreshItems'
> {
  invocationCwd: string
  launchGuard: LaunchGuard
  showOutcome: (report: OperationReport) => void
}

interface KillHandlerOptions extends SharedHandlerOptions {
  setPendingKillSessionName: (sessionName: string | null) => void
  regularSessions: Item[]
  rememberedSessions: (key: string | null) => void
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
  showOutcome: (report: OperationReport) => void
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
    regularSessions: options.regularSessions,
    rememberedSessions: options.rememberedSessions,
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
    options.showMessage
  )
}

interface RenameHandlerOptions extends Pick<
  SharedHandlerOptions,
  'backend' | 'config' | 'sessionItems' | 'showMessage' | 'refreshItems'
> {
  saveConfig: (config: Config) => Promise<void>
  setConfig: (config: Config) => void
}

// A failed rename keeps the dialog and its draft open; a completed one closes it even if follow-ups fail.
export async function handleRenameSubmitWithFeedback(
  renameTarget: Item | null,
  newName: string,
  closeModal: () => void,
  options: RenameHandlerOptions
): Promise<void> {
  if (!renameTarget || !options.backend) {
    closeModal()

    return
  }

  const outcome = await actionHandleRenameSubmit(renameTarget, newName, options.backend)

  if (outcome.kind === 'unchanged') {
    closeModal()

    return
  }

  if (outcome.kind === 'failed') {
    options.showMessage(outcome.message, 5000)

    return
  }

  closeModal()

  const noun = options.backend.kind === 'herdr' ? 'Workspace' : 'Session'

  const pin = options.config
    ? movePinAfterRename(
        options.config.pinnedSessions ?? [],
        renameTarget,
        outcome.target.title,
        options.sessionItems
      )
    : { kind: 'none' as const }

  let message = `${noun} renamed to '${outcome.target.title}'`

  if (pin.kind === 'ambiguous') {
    message += `. The pin on '${renameTarget.title}' was kept because another ${noun.toLowerCase()} still uses that name.`
  }

  if (pin.kind === 'moved' && options.config) {
    const next = { ...options.config, pinnedSessions: [...pin.pinnedSessions] }

    try {
      await options.saveConfig(next)
      options.setConfig(next)
    } catch (cause) {
      message += `. The pin could not be moved to the new name: ${cause instanceof Error ? cause.message : 'unknown error'}`
    }
  }

  options.showMessage(message)
  await options.refreshItems()
}

export async function handleNewSessionSubmitWithPreview(
  preview: LaunchPreview,
  options: NewSessionHandlerOptions
): Promise<void> {
  if (!options.backend) return

  if (options.launchGuard.active) {
    options.showMessage('A launch is already running; wait for it to finish.')

    return
  }

  options.launchGuard.active = true

  try {
    const outcome = await actionHandleNewSessionSubmit(
      preview,
      options.config,
      options.backend,
      options.invocationCwd,
      options.sessionItems
    )

    ActionOutcome.present(outcome, options)

    // A failed launch may still have created a session; plan the next Enter against fresh inventory.
    await runWithErrorMessage(() => options.refreshItems(), options.showMessage)
  } finally {
    options.launchGuard.active = false
  }
}

interface OutcomeRetryOptions extends OutcomePresenter {
  backend: MultiplexerBackend | null
  launchGuard: LaunchGuard
  refreshItems: () => Promise<void>
  closeModal: () => void
}

type PartialReport = Extract<OperationReport, { kind: 'partial' }>

async function retryOpen(
  report: PartialReport,
  target: WorkspaceRef,
  options: OutcomeRetryOptions
): Promise<void> {
  if (!options.backend) return

  if (options.launchGuard.active) {
    options.showMessage('A launch is already running; wait for it to finish.')

    return
  }

  options.launchGuard.active = true
  let focus: FocusOutcome

  try {
    focus = await options.backend.open(target)
  } catch (cause) {
    if (!isExpectedActionFailure(cause)) throw cause

    options.showOutcome({ ...report, failed: `Opening it again: ${cause.message}` })

    return
  } finally {
    options.launchGuard.active = false
  }

  options.closeModal()
  await requestShutdown(0, handoffOf(focus))
}

async function retryRefresh(report: PartialReport, options: OutcomeRetryOptions): Promise<void> {
  try {
    await options.refreshItems()
  } catch (cause) {
    if (!isExpectedActionFailure(cause)) throw cause

    options.showOutcome({ ...report, failed: `Refreshing the list again: ${cause.message}` })

    return
  }

  options.closeModal()
  options.showMessage('Refreshed')
}

// Enter on the outcome screen repeats only its safe follow-up; with none, it just closes.
export async function handleOutcomeRetryWithFeedback(
  report: OperationReport,
  options: OutcomeRetryOptions
): Promise<void> {
  if (report.kind === 'unknown') {
    options.closeModal()

    return
  }

  switch (report.retry.kind) {
    case 'none':
      options.closeModal()

      return
    case 'open':
      await retryOpen(report, report.retry.target, options)

      return
    case 'refresh':
      await retryRefresh(report, options)
  }
}

export async function handleSettingsEditorSubmitWithFeedback(
  field: SettingsFieldId,
  options: SettingsHandlerOptions
): Promise<void> {
  if (!options.config) {
    return
  }

  let nextConfig: Config

  // An invalid value stays in the editor with its draft; nothing is saved.
  try {
    const rawText = options.settingEditorPlainText ?? options.settingEditorValue
    nextConfig = applyEditorSetting(options.config, field, rawText, process.env.HOME || '~')
  } catch (error) {
    options.setSettingEditorError(error instanceof Error ? error.message : 'The value is not valid')

    return
  }

  options.setSettingEditorError('')

  const outcome = await persistConfigUpdate(
    nextConfig,
    `${getSettingEditorTitle(field)} updated`,
    options.saveConfig,
    options.setConfig,
    options.refreshItems
  )

  if (outcome.kind === 'failed') {
    options.setSettingEditorError(outcome.message)

    return
  }

  ActionOutcome.present(outcome, options)

  if (outcome.kind === 'completed') options.openSettingsModal()
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

  const outcome = await persistConfigUpdate(
    nextConfig,
    `${getSettingEditorTitle(field)} updated`,
    options.saveConfig,
    options.setConfig,
    options.refreshItems
  )

  ActionOutcome.present(outcome, options)
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

  const outcome = await persistConfigUpdate(
    nextConfig,
    `Session '${sessionName}' ${isPinned ? 'pinned' : 'unpinned'}`,
    options.saveConfig,
    options.setConfig,
    options.refreshItems
  )

  ActionOutcome.present(outcome, options)
}

export async function executeAppCommand(
  commandID: Parameters<typeof runCommand>[0],
  options: Parameters<typeof runCommand>[1]
): Promise<void> {
  await runCommand(commandID, options)
}

interface CreateAppHandlersOptions extends NewSessionHandlerOptions, SharedHandlerOptions {
  viewMode: ViewMode
  regularSessions: Item[]
  agentSessions: Item[]
  selectedPrimaryItem?: Item
  sessionCandidateItems: Item[]
  projectSourceItems: Item[]
  closeModal: () => void
  openRenameModal: (item: Item) => void
  openSettingsModal: () => void
  openSettingOptions: (field: 'theme') => void
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
  launchPreview: LaunchPreview
  rememberedSessions: (key: string | null) => void
  toggleDetails: () => void
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
      regularSessions: options.regularSessions,
      rememberedSessions: options.rememberedSessions,
    })
  }

  async function handleSelectWrapper(item: Item) {
    try {
      await handleSelectItem(item, options.config, options.backend)
    } catch (cause) {
      // Expected failures leave the picker and its inventory usable; defects still crash.
      if (!isExpectedActionFailure(cause)) throw cause

      options.showMessage(cause.message, 5000)
    }
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
      { ...sharedOptions, saveConfig: options.saveConfig, setConfig: options.setConfig }
    )
  }

  async function handleNewSessionSubmit() {
    await handleNewSessionSubmitWithPreview(options.launchPreview, {
      ...sharedOptions,
      invocationCwd: options.invocationCwd,
      launchGuard: options.launchGuard,
      showOutcome: options.showOutcome,
    })
  }

  async function handleOutcomeRetry(report: OperationReport) {
    await handleOutcomeRetryWithFeedback(report, {
      backend: options.backend,
      launchGuard: options.launchGuard,
      refreshItems: () => options.refreshItems(),
      closeModal: options.closeModal,
      showMessage: options.showMessage,
      showOutcome: options.showOutcome,
    })
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
      showOutcome: options.showOutcome,
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
      showOutcome: options.showOutcome,
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
      showOutcome: options.showOutcome,
    })
  }

  async function executeCommand(commandID: Parameters<typeof executeAppCommand>[0]) {
    await executeAppCommand(commandID, {
      keybindMode: options.config?.keybindMode ?? 'vim',
      viewMode: options.viewMode,
      agentSessions: options.agentSessions,
      selectedPrimaryItem: options.selectedPrimaryItem,
      sessionCandidateItems: options.sessionCandidateItems,
      projectSourceItems: options.projectSourceItems,
      closeModal: options.closeModal,
      openRenameModal: options.openRenameModal,
      openSettingsModal: options.openSettingsModal,
      openSettingOptions: options.openSettingOptions,
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
      showMessage: options.showMessage,
      toggleDetails: options.toggleDetails,
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
    handleOutcomeRetry,
    handleSettingsEditorSubmit,
    handleSettingOptionSubmit,
    handleTogglePinnedSessionWrapper,
    executeCommand,
  }
}
