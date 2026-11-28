import { executeCommand as runCommand } from './commands'
import {
  ActionOutcome,
  failureKind,
  isExpectedActionFailure,
  type OperationReport,
  type OutcomePresenter,
} from './action-outcome'
import { leaveJsonEditor, type IconsFormMode, type ModalState } from './modals'
import type { ShowToast } from './notifications'
import { persistConfigUpdate, runWithErrorToast } from './operations'
import { OptionPicker } from './option-picker'
import type { Dispatch, SetStateAction } from 'react'
import { AppMode, type Config, type Item, type ViewMode } from '../types'
import type { SettingsFieldId } from '../settings'
import type { MultiplexerBackend } from '../multiplexer'
import { handoffOf } from '../multiplexer/focus-outcome'
import { workspaceNoun, type FocusOutcome, type WorkspaceRef } from '../multiplexer/types'
import type { CloneServices } from '../sessions/clone-plan'
import type { LaunchPreview } from '../sessions/launch-plan'
import { requestShutdown } from '../lifecycle/shutdown'
import { movePinAfterRename } from '../config/pinned-sessions'
import type { CleanupBatch, CloseReceipt } from '../sessions/cleanup-batch'
import { CleanupPlan } from '../sessions/cleanup-plan'
import {
  applyEditorSetting,
  applyOptionSetting,
  editSetting,
  getSettingEditorTitle,
  getSettingDisplayValue,
  getSettingEditorValue,
  isSettingsChange,
  resetSetting,
  stepSetting,
} from '../settings'
import { IconsForm, type IconsChange, type IconsFormAction } from '../settings-icons'
import {
  handleCloseBatch,
  handleRetryCloseBatch,
  type BatchCloseOutcome,
  handleEditTarget as actionHandleEditTarget,
  handleKillSession as actionHandleKillSession,
  handleLastSession as actionHandleLastSession,
  handleNewSessionSubmit as actionHandleNewSessionSubmit,
  handleRenameSubmit as actionHandleRenameSubmit,
  handleRootSession as actionHandleRootSession,
  handleSelect as actionHandleSelect,
} from '../handlers/actions'

interface SharedHandlerOptions {
  backend: MultiplexerBackend | null
  config: Config | null
  items: Item[]
  sessionItems: Item[]
  cursor: number
  showToast: ShowToast
  refreshItems: (forceViewMode?: ViewMode, nextConfig?: Config | null) => Promise<void>
}

// One per picker: a second Enter while a launch runs must not start an overlapping mutation.
export interface LaunchGuard {
  active: boolean
}

interface NewSessionHandlerOptions extends Pick<
  SharedHandlerOptions,
  'backend' | 'showToast' | 'refreshItems'
> {
  clone: CloneServices
  launchGuard: LaunchGuard
  showOutcome: (report: OperationReport) => void
}

interface ReviewedCloseOptions extends OutcomePresenter {
  backend: MultiplexerBackend | null
  sessionItems: Item[]
  regularSessions: Item[]
  inventoryRevision: () => number
  rememberedSessions: (key: string | null) => void
  refreshItems: () => Promise<void>
}

interface SettingsHandlerOptions {
  config: Config | null
  saveConfig: (config: Config) => Promise<void>
  setConfig: (config: Config) => void
  setSettingEditorError: (message: string) => void
  // Back to Settings on the same row and filter.
  returnToSettings: () => void
  settingEditorValue: string
  settingEditorPlainText?: string
  refreshItems: (forceViewMode?: ViewMode, nextConfig?: Config | null) => Promise<void>
  showToast: ShowToast
  showOutcome: (report: OperationReport) => void
}

// The caller drops the waiting close first, so another d cannot confirm it twice. The stored ref
// is closed only if the inventory on screen still shows the target as it was reviewed.
async function handleReviewedCloseWithFeedback(
  plan: CleanupPlan,
  options: ReviewedCloseOptions
): Promise<void> {
  if (!options.backend) return

  const check = CleanupPlan.recheck(plan, options.sessionItems, options.inventoryRevision())

  if (check.kind === 'changed') {
    options.showToast({ kind: 'warning', message: check.message })

    return
  }

  const outcome = await actionHandleKillSession(check.plan, options.backend, {
    refreshItems: options.refreshItems,
    regularSessions: options.regularSessions,
    rememberedSessions: options.rememberedSessions,
  })

  ActionOutcome.present(outcome, options)
}

interface BatchCloseOptions {
  backend: MultiplexerBackend | null
  sessionItems: Item[]
  inventoryRevision: () => number
  reloadSessions: () => Promise<readonly Item[] | undefined>
  clearMarks: () => void
  closeModal: () => void
  showToast: ShowToast
  showReceipt: (receipt: CloseReceipt) => void
}

function presentBatch(outcome: BatchCloseOutcome, options: BatchCloseOptions): void {
  switch (outcome.kind) {
    case 'completed':
      options.showToast({ kind: 'success', message: outcome.message })

      return
    case 'failed':
      options.showToast({ kind: 'error', message: outcome.message })

      return
    case 'receipt':
      options.showReceipt(outcome.receipt)
  }
}

// The review and the marks close first, so a second Enter cannot confirm the batch twice.
async function handleReviewedBatchCloseWithFeedback(
  batch: CleanupBatch,
  options: BatchCloseOptions
): Promise<void> {
  options.closeModal()
  options.clearMarks()

  if (!options.backend) return

  const outcome = await handleCloseBatch(batch, options.backend, {
    sessionItems: options.sessionItems,
    revision: options.inventoryRevision(),
    reloadSessions: options.reloadSessions,
  })

  presentBatch(outcome, options)
}

async function handleBatchRetryWithFeedback(
  receipt: CloseReceipt,
  options: BatchCloseOptions
): Promise<void> {
  options.closeModal()

  if (!options.backend) return

  const outcome = await handleRetryCloseBatch(receipt, options.backend, {
    revision: options.inventoryRevision(),
    reloadSessions: options.reloadSessions,
  })

  // A retry that could not start keeps the earlier receipt on screen.
  if (outcome.kind === 'failed') options.showReceipt(receipt)

  presentBatch(outcome, options)
}

export async function handleSelectItem(
  item: Item,
  config: Config | null,
  backend: MultiplexerBackend | null
): Promise<void> {
  if (!backend) return
  await actionHandleSelect(item, config, backend)
}

async function handleLastSessionWithFeedback(options: SharedHandlerOptions): Promise<void> {
  if (!options.backend) return
  const backend = options.backend
  await runWithErrorToast(
    () => actionHandleLastSession(options.sessionItems, backend),
    options.showToast
  )
}

async function handleRootSessionWithFeedback(
  item: Item | undefined,
  options: SharedHandlerOptions
): Promise<void> {
  if (!options.backend) return
  const backend = options.backend
  await runWithErrorToast(
    () => actionHandleRootSession(item, options.config, backend),
    options.showToast
  )
}

async function handleEditTargetWithFeedback(
  item: Item | undefined,
  options: SharedHandlerOptions
): Promise<void> {
  if (!options.backend) return
  const backend = options.backend
  await runWithErrorToast(
    () => actionHandleEditTarget(item, options.config, backend),
    options.showToast
  )
}

interface RenameHandlerOptions extends Pick<
  SharedHandlerOptions,
  'backend' | 'config' | 'sessionItems' | 'showToast' | 'refreshItems'
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
    options.showToast({ kind: 'error', message: outcome.message })

    return
  }

  closeModal()

  const noun = workspaceNoun(options.backend.kind)

  const pin = options.config
    ? movePinAfterRename(
        options.config.pinnedSessions ?? [],
        renameTarget,
        outcome.target.title,
        options.sessionItems
      )
    : { kind: 'none' as const }

  let message = `${noun.charAt(0).toUpperCase()}${noun.slice(1)} renamed to '${outcome.target.title}'`
  // The rename happened either way; a pin left behind is worth a warning, not a failure.
  let kind: 'success' | 'warning' = 'success'

  if (pin.kind === 'ambiguous') {
    kind = 'warning'
    message += `. The pin on '${renameTarget.title}' was kept because another ${noun} still uses that name.`
  }

  if (pin.kind === 'moved' && options.config) {
    const next = { ...options.config, pinnedSessions: [...pin.pinnedSessions] }

    try {
      await options.saveConfig(next)
      options.setConfig(next)
    } catch (cause) {
      kind = 'warning'
      message += `. The pin could not be moved to the new name: ${cause instanceof Error ? cause.message : 'unknown error'}`
    }
  }

  options.showToast({ kind, message })
  await options.refreshItems()
}

export async function handleNewSessionSubmitWithPreview(
  preview: LaunchPreview,
  options: NewSessionHandlerOptions
): Promise<void> {
  if (!options.backend) return

  if (options.launchGuard.active) {
    options.showToast({
      kind: 'warning',
      message: 'A launch is already running; wait for it to finish.',
    })

    return
  }

  options.launchGuard.active = true

  try {
    const outcome = await actionHandleNewSessionSubmit(preview, options.backend, options.clone)

    ActionOutcome.present(outcome, options)

    // A failed launch may still have created a session; plan the next Enter against fresh inventory.
    await runWithErrorToast(() => options.refreshItems(), options.showToast)
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
    options.showToast({
      kind: 'warning',
      message: 'A launch is already running; wait for it to finish.',
    })

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
  options.showToast({ kind: 'success', message: 'Refreshed' })
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

  const homeDir = process.env.HOME || '~'
  const rawText = options.settingEditorPlainText ?? options.settingEditorValue
  const edit = editSetting(options.config, field, rawText, homeDir)

  // An invalid value stays in the editor with its draft; nothing is saved.
  if (edit.kind === 'invalid') {
    options.setSettingEditorError(edit.message)

    return
  }

  const nextConfig = edit.config

  // The saved value through the same reload, so an unchanged value compares equal.
  const savedText = getSettingEditorValue(options.config, field)
  const savedConfig = applyEditorSetting(options.config, field, savedText, homeDir)

  options.setSettingEditorError('')

  if (!isSettingsChange(savedConfig, nextConfig)) {
    options.returnToSettings()

    return
  }

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

  if (outcome.kind === 'completed') options.returnToSettings()
}

// The open picker keeps its draft until the save succeeds. A failure is also reported as a
// message, since the picker may have been closed while the save ran.
export async function handleSettingOptionSubmitWithFeedback(
  field: SettingsFieldId,
  value: string,
  options: SettingsHandlerOptions,
  trackPicker: (picker: OptionPicker) => void = () => {}
): Promise<void> {
  if (!options.config) {
    return
  }

  const nextConfig = applyOptionSetting(options.config, field, value)

  if (!isSettingsChange(options.config, nextConfig)) return

  const draft = OptionPicker.draftOf(options.config, field, value)
  trackPicker(OptionPicker.saving(draft))

  const outcome = await persistConfigUpdate(
    nextConfig,
    `${getSettingEditorTitle(field)} updated`,
    options.saveConfig,
    options.setConfig,
    options.refreshItems
  )

  trackPicker(
    outcome.kind === 'failed'
      ? OptionPicker.saveFailed(draft, outcome.message)
      : OptionPicker.browsing
  )
  ActionOutcome.present(outcome, options)
}

// A change made on the Settings list itself saves at once, one at a time; the row's value
// changes only after the save succeeds.
async function saveSettingsRowChange(
  field: SettingsFieldId,
  nextConfig: Config,
  verb: 'updated' | 'reset',
  options: SettingsHandlerOptions,
  trackSave: (picker: OptionPicker) => void
): Promise<void> {
  const title = getSettingEditorTitle(field)
  const value = getSettingDisplayValue(nextConfig, field)
  const draft = { value, label: `${title} ${value}` }
  trackSave(OptionPicker.saving(draft))

  const outcome = await persistConfigUpdate(
    nextConfig,
    `${title} ${verb}`,
    options.saveConfig,
    options.setConfig,
    options.refreshItems
  )

  trackSave(
    outcome.kind === 'failed'
      ? OptionPicker.saveFailed(draft, outcome.message)
      : OptionPicker.browsing
  )
  ActionOutcome.present(outcome, options)
}

// ←/→ on a Settings row saves the next value at once; at a limit nothing is saved or said.
async function handleSettingStepWithFeedback(
  field: SettingsFieldId,
  direction: 1 | -1,
  options: SettingsHandlerOptions,
  trackSave: (picker: OptionPicker) => void = () => {}
): Promise<void> {
  if (!options.config) return

  const nextConfig = stepSetting(options.config, field, direction)

  if (!nextConfig) return
  await saveSettingsRowChange(field, nextConfig, 'updated', options, trackSave)
}

// ctrl+r puts the default back; a value that already is the default saves nothing.
async function handleSettingResetWithFeedback(
  field: SettingsFieldId,
  options: SettingsHandlerOptions,
  trackSave: (picker: OptionPicker) => void = () => {}
): Promise<void> {
  if (!options.config) return

  const nextConfig = resetSetting(options.config, field, process.env.HOME || '~')

  if (!nextConfig) return
  await saveSettingsRowChange(field, nextConfig, 'reset', options, trackSave)
}

// A form change saves at once, one at a time. A glyph that fails to save goes back into its field
// with the reason, so it can be retried or cancelled.
async function handleIconsChangeWithFeedback(
  action: IconsFormAction,
  options: SettingsHandlerOptions,
  trackForm: (mode: IconsFormMode) => void
): Promise<void> {
  if (!options.config) return

  const change: IconsChange =
    action.kind === 'apply'
      ? {
          kind: 'set',
          icon: action.icon,
          glyph: options.settingEditorPlainText ?? options.settingEditorValue,
        }
      : action

  const nextConfig = IconsForm.apply(options.config, change)
  options.setSettingEditorError('')

  if (!isSettingsChange(options.config, nextConfig)) {
    trackForm({ kind: 'browsing' })

    return
  }

  trackForm({ kind: 'saving' })

  const outcome = await persistConfigUpdate(
    nextConfig,
    iconsChangeMessage(change, nextConfig),
    options.saveConfig,
    options.setConfig,
    options.refreshItems
  )

  if (outcome.kind === 'failed') {
    options.setSettingEditorError(outcome.message)
    trackForm(
      action.kind === 'apply' ? { kind: 'editing', icon: action.icon } : { kind: 'browsing' }
    )

    return
  }

  trackForm({ kind: 'browsing' })
  ActionOutcome.present(outcome, options)
}

function iconsChangeMessage(change: IconsChange, config: Config): string {
  switch (change.kind) {
    case 'toggle':
      return `Icons ${getSettingDisplayValue(config, 'icons')}`
    case 'set':
      return `${IconsForm.titleOf(change.icon)} icon updated`
    case 'clear':
      return `${IconsForm.titleOf(change.icon)} icon cleared`
  }
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
  setModalState: Dispatch<SetStateAction<ModalState>>
  requestKillSession: (item: Item) => void
  requestMarkedClose: () => Promise<void>
  toggleMark: (item: Item) => void
  clearMarks: () => void
  markedItems: ReadonlyMap<string, Item>
  reloadSessions: () => Promise<readonly Item[] | undefined>
  setAppMode: (mode: AppMode) => void
  setViewMode: (mode: ViewMode) => void
  setAllItems: (items: Item[]) => void
  setItems: (items: Item[]) => void
  setCursor: (cursor: number) => void
  setSearchQuery: (value: string) => void
  setAgentCursor: (cursor: number) => void
  saveConfig: (config: Config) => Promise<void>
  setConfig: (config: Config) => void
  setSettingEditorError: (message: string) => void
  settingEditorValue: string
  settingEditorPlainText?: string
  renameTarget: Item | null
  renamedValue: string
  launchPreview: LaunchPreview
  rememberedSessions: (key: string | null) => void
  inventoryRevision: () => number
  toggleDetails: () => void
  refreshList: () => Promise<void>
}

export function createAppHandlers(options: CreateAppHandlersOptions) {
  const sharedOptions: SharedHandlerOptions = {
    backend: options.backend,
    config: options.config,
    items: options.items,
    sessionItems: options.sessionItems,
    cursor: options.cursor,
    showToast: options.showToast,
    refreshItems: options.refreshItems,
  }

  async function confirmCloseReview(plan: CleanupPlan) {
    await handleReviewedCloseWithFeedback(plan, {
      backend: options.backend,
      sessionItems: options.sessionItems,
      regularSessions: options.regularSessions,
      inventoryRevision: options.inventoryRevision,
      rememberedSessions: options.rememberedSessions,
      refreshItems: () => options.refreshItems(),
      showToast: options.showToast,
      showOutcome: options.showOutcome,
    })
  }

  const batchOptions: BatchCloseOptions = {
    backend: options.backend,
    sessionItems: options.sessionItems,
    inventoryRevision: options.inventoryRevision,
    reloadSessions: options.reloadSessions,
    clearMarks: options.clearMarks,
    closeModal: options.closeModal,
    showToast: options.showToast,
    showReceipt: receipt => options.setModalState({ type: 'close-batch-results', receipt }),
  }

  async function confirmBatchClose(batch: CleanupBatch) {
    await handleReviewedBatchCloseWithFeedback(batch, batchOptions)
  }

  async function retryBatchClose(receipt: CloseReceipt) {
    await handleBatchRetryWithFeedback(receipt, batchOptions)
  }

  async function handleSelectWrapper(item: Item) {
    try {
      await handleSelectItem(item, options.config, options.backend)
    } catch (cause) {
      // Expected failures leave the picker and its inventory usable; defects still crash.
      if (!isExpectedActionFailure(cause)) throw cause

      options.showToast({ kind: failureKind(cause), message: cause.message })
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

  // Runs the frozen preview, or a plan a Projects number key made for another row.
  async function handleNewSessionSubmit(preview: LaunchPreview = options.launchPreview) {
    await handleNewSessionSubmitWithPreview(preview, {
      ...sharedOptions,
      clone: options.clone,
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
      showToast: options.showToast,
      showOutcome: options.showOutcome,
    })
  }

  function returnToSettings() {
    options.setModalState({ type: 'settings', picker: OptionPicker.browsing })
  }

  function trackSettingsSave(picker: OptionPicker) {
    options.setModalState(OptionPicker.withinSettings(picker))
  }

  async function handleSettingsEditorSubmit(field: SettingsFieldId) {
    await handleSettingsEditorSubmitWithFeedback(field, {
      config: options.config,
      saveConfig: options.saveConfig,
      setConfig: options.setConfig,
      setSettingEditorError: options.setSettingEditorError,
      // The raw JSON editor goes back to the list or rule pane that opened it.
      returnToSettings: () => options.setModalState(leaveJsonEditor),
      settingEditorValue: options.settingEditorValue,
      settingEditorPlainText: options.settingEditorPlainText,
      refreshItems: options.refreshItems,
      showToast: options.showToast,
      showOutcome: options.showOutcome,
    })
  }

  async function handleSettingOptionSubmit(field: SettingsFieldId, value: string) {
    await handleSettingOptionSubmitWithFeedback(
      field,
      value,
      {
        config: options.config,
        saveConfig: options.saveConfig,
        setConfig: options.setConfig,
        setSettingEditorError: options.setSettingEditorError,
        returnToSettings,
        settingEditorValue: options.settingEditorValue,
        refreshItems: options.refreshItems,
        showToast: options.showToast,
        showOutcome: options.showOutcome,
      },
      picker => options.setModalState(OptionPicker.within(field, picker))
    )
  }

  async function handleSettingStep(field: SettingsFieldId, direction: 1 | -1) {
    await handleSettingStepWithFeedback(
      field,
      direction,
      {
        config: options.config,
        saveConfig: options.saveConfig,
        setConfig: options.setConfig,
        setSettingEditorError: options.setSettingEditorError,
        returnToSettings,
        settingEditorValue: options.settingEditorValue,
        refreshItems: options.refreshItems,
        showToast: options.showToast,
        showOutcome: options.showOutcome,
      },
      trackSettingsSave
    )
  }

  async function handleSettingReset(field: SettingsFieldId) {
    await handleSettingResetWithFeedback(
      field,
      {
        config: options.config,
        saveConfig: options.saveConfig,
        setConfig: options.setConfig,
        setSettingEditorError: options.setSettingEditorError,
        returnToSettings,
        settingEditorValue: options.settingEditorValue,
        refreshItems: options.refreshItems,
        showToast: options.showToast,
        showOutcome: options.showOutcome,
      },
      trackSettingsSave
    )
  }

  async function handleIconsChange(action: IconsFormAction) {
    await handleIconsChangeWithFeedback(
      action,
      {
        config: options.config,
        saveConfig: options.saveConfig,
        setConfig: options.setConfig,
        setSettingEditorError: options.setSettingEditorError,
        returnToSettings,
        settingEditorValue: options.settingEditorValue,
        settingEditorPlainText: options.settingEditorPlainText,
        refreshItems: options.refreshItems,
        showToast: options.showToast,
        showOutcome: options.showOutcome,
      },
      mode =>
        options.setModalState(current =>
          current?.type === 'icons-form' ? { ...current, mode } : current
        )
    )
  }

  async function handleTogglePinnedSessionWrapper(sessionName: string) {
    await handleTogglePinnedSessionWithFeedback(sessionName, {
      config: options.config,
      saveConfig: options.saveConfig,
      setConfig: options.setConfig,
      setSettingEditorError: options.setSettingEditorError,
      returnToSettings,
      settingEditorValue: options.settingEditorValue,
      refreshItems: options.refreshItems,
      showToast: options.showToast,
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
      requestMarkedClose: options.requestMarkedClose,
      toggleMark: options.toggleMark,
      markedItems: options.markedItems,
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
      refreshList: options.refreshList,
      toggleDetails: options.toggleDetails,
    })
  }

  return {
    confirmCloseReview,
    confirmBatchClose,
    retryBatchClose,
    handleSelectWrapper,
    handleLastSessionWrapper,
    handleRootSessionWrapper,
    handleEditTargetWrapper,
    handleRenameSubmit,
    handleNewSessionSubmit,
    handleOutcomeRetry,
    handleSettingsEditorSubmit,
    handleSettingOptionSubmit,
    handleSettingStep,
    handleSettingReset,
    handleIconsChange,
    handleTogglePinnedSessionWrapper,
    executeCommand,
  }
}
