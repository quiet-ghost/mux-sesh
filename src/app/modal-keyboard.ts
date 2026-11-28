import {
  describeUnavailableAction,
  matchEditorAction,
  matchListAction,
  matchOptionAction,
  matchRuleAction,
  matchSettingsAction,
} from './action-catalog'
import type { OperationReport } from './action-outcome'
import type { ModalState } from './modals'
import { OptionPicker } from './option-picker'
import type { ShowToast } from './notifications'
import type { SettingPaneAction } from './setting-pane-actions'
import type { SettingPaneView } from './setting-panes'
import { CloseReceipt, type CleanupBatch } from '../sessions/cleanup-batch'
import {
  getSettingCollection,
  type SettingCollection,
  type SettingsEntry,
  type SettingsOption,
} from '../settings'
import type { CommandEntry } from '../ui/CommandsModal'
import { clampCursorIndex } from '../ui/list-window'

interface ModalKeyboardContext {
  modalState: ModalState
  filteredCommandEntries: CommandEntry[]
  commandsCursor: number
  setCommandsCursor: (cursor: (current: number) => number) => void
  filteredSettingsEntries: SettingsEntry[]
  settingsCursor: number
  setSettingsCursor: (cursor: (current: number) => number) => void
  settingsSearchQuery: string
  setSettingsSearchQuery: (query: string) => void
  filteredSettingOptions: SettingsOption[]
  settingOptionsCursor: number
  setSettingOptionsCursor: (cursor: (current: number) => number) => void
  closeModal: () => void
  openSettingOptions: (field: SettingsEntry['id']) => void
  openSettingEditor: (field: SettingsEntry['id']) => void
  isOptionSetting: (field: SettingsEntry['id']) => boolean
  setModalState: (state: ModalState) => void
  setSettingEditorError: (message: string) => void
  runAction: (task: () => Promise<void>) => void
  executeCommand: (id: CommandEntry['id']) => Promise<void>
  showToast: ShowToast
  handleSettingOptionSubmit: (field: SettingsEntry['id'], value: string) => Promise<void>
  handleSettingsEditorSubmit: (field: SettingsEntry['id']) => Promise<void>
  handleSettingStep: (field: SettingsEntry['id'], direction: 1 | -1) => Promise<void>
  handleSettingReset: (field: SettingsEntry['id']) => Promise<void>
  handleRenameSubmit: () => Promise<void>
  handleOutcomeRetry: (report: OperationReport) => Promise<void>
  confirmBatchClose: (batch: CleanupBatch) => Promise<void>
  retryBatchClose: (receipt: CloseReceipt) => Promise<void>
  // The list, rule list or rule form on screen and the keys it offers; undefined while none is.
  settingPaneView: SettingPaneView | undefined
  openSettingPane: (collection: SettingCollection) => void
  handleSettingPaneAction: (action: SettingPaneAction, direction: 1 | -1) => Promise<void>
}

interface KeyboardInput {
  name?: string
  ctrl?: boolean
  shift?: boolean
}

function openSetting(ctx: ModalKeyboardContext, entry: SettingsEntry) {
  if (ctx.isOptionSetting(entry.id)) {
    ctx.openSettingOptions(entry.id)

    return
  }

  const collection = getSettingCollection(entry.id)

  if (collection) {
    ctx.openSettingPane(collection)

    return
  }

  ctx.openSettingEditor(entry.id)
}

// Settings saves one row change at a time, so the next change starts from the saved value.
function changeSetting(
  ctx: ModalKeyboardContext,
  picker: OptionPicker,
  change: () => Promise<void>
) {
  if (picker.kind !== 'saving') ctx.runAction(change)
}

// Settings keeps its filter focused: letters type, and ←/→ belong to the list, not the query.
function cursorStep(key: KeyboardInput): 1 | -1 {
  return key.name === 'up' || key.name === 'left' || key.name === 'k' ? -1 : 1
}

function handleSettingsKey(
  key: KeyboardInput,
  ctx: ModalKeyboardContext,
  picker: OptionPicker
): boolean {
  const entry = ctx.filteredSettingsEntries[ctx.settingsCursor]
  const action = matchSettingsAction(entry, ctx.settingsSearchQuery, key)
  const count = ctx.filteredSettingsEntries.length

  switch (action) {
    case 'settings-move':
      ctx.setSettingsCursor(current => clampCursorIndex(count, current + cursorStep(key)))

      return true
    case 'settings-change':
    case 'settings-toggle':
      if (entry) changeSetting(ctx, picker, () => ctx.handleSettingStep(entry.id, cursorStep(key)))

      return true
    case 'settings-open':
      if (entry) openSetting(ctx, entry)

      return true
    case 'settings-reset':
      if (entry) changeSetting(ctx, picker, () => ctx.handleSettingReset(entry.id))

      return true
    case 'settings-clear':
      ctx.setSettingsSearchQuery('')

      return true
    case 'settings-close':
      ctx.closeModal()

      return true
    case 'none':
      // ←/→ belong to the list, even on a row they do not change; the filter never gets them.
      return key.name === 'left' || key.name === 'right'
  }
}

function paneAction(
  view: SettingPaneView | undefined,
  key: KeyboardInput
): SettingPaneAction | undefined {
  if (!view) return undefined

  if (view.kind === 'setting-list') {
    const id = matchListAction(view, key)

    return id === 'none' ? undefined : { pane: 'list', id }
  }

  const id = matchRuleAction(view, key)

  return id === 'none' ? undefined : { pane: 'rule', id }
}

// Every modal is a focused text field, so only non-text keys act; letters stay in the field.
// Returns whether the modal consumed the key, so the field must not also handle it.
export function handleModalKeyboard(key: KeyboardInput, ctx: ModalKeyboardContext): boolean {
  if (ctx.modalState?.type === 'outcome') {
    const { report } = ctx.modalState

    if (key.name === 'return') {
      ctx.runAction(() => ctx.handleOutcomeRetry(report))
    } else if (key.name === 'escape') {
      ctx.closeModal()
    } else {
      return false
    }

    return true
  }

  // The batch review closes only its stored set, so cursor or filter changes cannot widen it.
  if (ctx.modalState?.type === 'close-batch-review') {
    const { batch } = ctx.modalState

    if (key.name === 'return') {
      ctx.runAction(() => ctx.confirmBatchClose(batch))
    } else if (key.name === 'escape') {
      ctx.closeModal()
    } else {
      return false
    }

    return true
  }

  // Enter retries only what the receipt still shows as open; with nothing to retry, it closes.
  if (ctx.modalState?.type === 'close-batch-results') {
    const { receipt } = ctx.modalState

    if (key.name === 'return' && CloseReceipt.retryable(receipt).length > 0) {
      ctx.runAction(() => ctx.retryBatchClose(receipt))
    } else if (key.name === 'return' || key.name === 'escape') {
      ctx.closeModal()
    } else {
      return false
    }

    return true
  }

  if (ctx.modalState?.type === 'rename') {
    if (key.name === 'return') {
      ctx.runAction(ctx.handleRenameSubmit)
    } else if (key.name === 'escape') {
      ctx.closeModal()
    } else {
      return false
    }

    return true
  }

  if (ctx.modalState?.type === 'commands') {
    if (key.name === 'escape') {
      ctx.closeModal()
    } else if (key.name === 'down') {
      ctx.setCommandsCursor(current =>
        clampCursorIndex(ctx.filteredCommandEntries.length, current + 1)
      )
    } else if (key.name === 'up') {
      ctx.setCommandsCursor(current =>
        clampCursorIndex(ctx.filteredCommandEntries.length, current - 1)
      )
    } else if (key.name === 'return') {
      const command = ctx.filteredCommandEntries[ctx.commandsCursor]

      if (!command) {
        return true
      }

      const refusal = describeUnavailableAction(command)

      if (refusal) {
        ctx.showToast({ kind: 'warning', message: refusal })

        return true
      }

      ctx.runAction(() => ctx.executeCommand(command.id))
    } else {
      return false
    }

    return true
  }

  if (ctx.modalState?.type === 'settings') {
    return handleSettingsKey(key, ctx, ctx.modalState.picker)
  }

  if (ctx.modalState?.type === 'setting-options') {
    const { field, openedFrom, picker } = ctx.modalState
    const count = ctx.filteredSettingOptions.length

    switch (matchOptionAction(key)) {
      // The preview is the highlighted option, so leaving the picker restores the saved theme.
      case 'option-back':
        if (openedFrom === 'commands') ctx.closeModal()
        else ctx.setModalState({ type: 'settings', picker: OptionPicker.browsing })

        return true
      case 'option-move':
        ctx.setSettingOptionsCursor(current => clampCursorIndex(count, current + cursorStep(key)))

        return true
      case 'option-apply': {
        const option = ctx.filteredSettingOptions[ctx.settingOptionsCursor]

        if (option && picker.kind !== 'saving') {
          ctx.runAction(() => ctx.handleSettingOptionSubmit(field, option.value))
        }

        return true
      }

      case 'none':
        return false
    }
  }

  // A list or rule pane has no text field unless one is open, so single letters act meanwhile.
  if (
    ctx.modalState?.type === 'setting-list' ||
    ctx.modalState?.type === 'setting-rules' ||
    ctx.modalState?.type === 'setting-rule'
  ) {
    const action = paneAction(ctx.settingPaneView, key)

    if (!action) return false

    ctx.runAction(() => ctx.handleSettingPaneAction(action, cursorStep(key)))

    return true
  }

  if (ctx.modalState?.type === 'setting-editor') {
    const { field } = ctx.modalState

    switch (matchEditorAction(key)) {
      case 'editor-back':
        ctx.setModalState({ type: 'settings', picker: OptionPicker.browsing })
        ctx.setSettingEditorError('')

        return true
      case 'editor-apply':
        ctx.runAction(() => ctx.handleSettingsEditorSubmit(field))

        return true
      case 'none':
        return false
    }
  }

  return false
}
