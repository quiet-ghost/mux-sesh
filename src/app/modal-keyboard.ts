import { describeUnavailableAction } from './action-catalog'
import type { OperationReport } from './action-outcome'
import type { ModalState } from './modals'
import { OptionPicker } from './option-picker'
import type { ShowToast } from './notifications'
import { CloseReceipt, type CleanupBatch } from '../sessions/cleanup-batch'
import type { SettingsEntry, SettingsOption } from '../settings'
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
}

interface KeyboardInput {
  name?: string
  ctrl?: boolean
}

function openSetting(ctx: ModalKeyboardContext, entry: SettingsEntry) {
  if (ctx.isOptionSetting(entry.id)) {
    ctx.openSettingOptions(entry.id)

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
function handleSettingsKey(
  key: KeyboardInput,
  ctx: ModalKeyboardContext,
  picker: OptionPicker
): boolean {
  const entry = ctx.filteredSettingsEntries[ctx.settingsCursor]

  if (key.name === 'escape') {
    if (ctx.settingsSearchQuery.length > 0) ctx.setSettingsSearchQuery('')
    else ctx.closeModal()
  } else if (key.name === 'down') {
    ctx.setSettingsCursor(current =>
      clampCursorIndex(ctx.filteredSettingsEntries.length, current + 1)
    )
  } else if (key.name === 'up') {
    ctx.setSettingsCursor(current =>
      clampCursorIndex(ctx.filteredSettingsEntries.length, current - 1)
    )
  } else if (key.name === 'left' || key.name === 'right') {
    const direction = key.name === 'right' ? 1 : -1

    if (entry && entry.control !== 'open') {
      changeSetting(ctx, picker, () => ctx.handleSettingStep(entry.id, direction))
    }
  } else if (key.name === 'return') {
    if (entry?.control === 'toggle')
      changeSetting(ctx, picker, () => ctx.handleSettingStep(entry.id, 1))
    else if (entry?.control === 'cycle' || entry?.control === 'open') openSetting(ctx, entry)
  } else if (key.ctrl && key.name === 'r') {
    if (entry?.reset === 'available')
      changeSetting(ctx, picker, () => ctx.handleSettingReset(entry.id))
  } else {
    return false
  }

  return true
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

    // The preview is the highlighted option, so leaving the picker restores the saved theme.
    if (key.name === 'escape') {
      if (openedFrom === 'commands') {
        ctx.closeModal()
      } else {
        ctx.setModalState({ type: 'settings', picker: OptionPicker.browsing })
      }
    } else if (key.name === 'down') {
      ctx.setSettingOptionsCursor(current =>
        clampCursorIndex(ctx.filteredSettingOptions.length, current + 1)
      )
    } else if (key.name === 'up') {
      ctx.setSettingOptionsCursor(current =>
        clampCursorIndex(ctx.filteredSettingOptions.length, current - 1)
      )
    } else if (key.name === 'return') {
      const option = ctx.filteredSettingOptions[ctx.settingOptionsCursor]

      if (!option || picker.kind === 'saving') return true
      ctx.runAction(() => ctx.handleSettingOptionSubmit(field, option.value))
    } else {
      return false
    }

    return true
  }

  if (ctx.modalState?.type === 'setting-editor') {
    const { field } = ctx.modalState

    if (key.name === 'escape') {
      ctx.setModalState({ type: 'settings', picker: OptionPicker.browsing })
      ctx.setSettingEditorError('')
    } else if (key.name === 'return') {
      ctx.runAction(() => ctx.handleSettingsEditorSubmit(field))
    } else {
      return false
    }

    return true
  }

  return false
}
