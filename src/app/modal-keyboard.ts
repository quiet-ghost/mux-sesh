import type { ModalState } from './modals'
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
  filteredSettingOptions: SettingsOption[]
  settingOptionsCursor: number
  setSettingOptionsCursor: (cursor: (current: number) => number) => void
  closeModal: () => void
  openSettingOptions: (field: SettingsEntry['id']) => void
  previewThemeOption?: (value: string | null) => void
  openSettingEditor: (field: SettingsEntry['id']) => void
  isOptionSetting: (field: SettingsEntry['id']) => boolean
  setModalState: (state: ModalState) => void
  setSettingEditorError: (message: string) => void
  executeCommand: (id: CommandEntry['id']) => Promise<void>
  handleSettingOptionSubmit: (field: SettingsEntry['id'], value: string) => Promise<void>
  handleSettingsEditorSubmit: (field: SettingsEntry['id']) => Promise<void>
  handleRenameSubmit: () => Promise<void>
}

interface KeyboardInput {
  name?: string
}

function openSelectedSetting(ctx: ModalKeyboardContext) {
  const entry = ctx.filteredSettingsEntries[ctx.settingsCursor]
  if (!entry) {
    return
  }

  if (ctx.isOptionSetting(entry.id)) {
    ctx.openSettingOptions(entry.id)
    return
  }

  ctx.openSettingEditor(entry.id)
}

export function handleModalKeyboard(key: KeyboardInput, ctx: ModalKeyboardContext): boolean {
  if (ctx.modalState?.type === 'rename') {
    if (key.name === 'return') {
      void ctx.handleRenameSubmit()
    } else if (key.name === 'escape') {
      ctx.closeModal()
    }
    return true
  }

  if (ctx.modalState?.type === 'commands') {
    if (key.name === 'escape' || key.name === 'q') {
      ctx.closeModal()
    } else if (key.name === 'down' || key.name === 'j') {
      ctx.setCommandsCursor(current =>
        clampCursorIndex(ctx.filteredCommandEntries.length, current + 1)
      )
    } else if (key.name === 'up' || key.name === 'k') {
      ctx.setCommandsCursor(current =>
        clampCursorIndex(ctx.filteredCommandEntries.length, current - 1)
      )
    } else if (key.name === 'return') {
      const command = ctx.filteredCommandEntries[ctx.commandsCursor]
      if (!command) {
        return true
      }
      void ctx.executeCommand(command.id)
    }
    return true
  }

  if (ctx.modalState?.type === 'settings') {
    if (key.name === 'escape') {
      ctx.closeModal()
    } else if (key.name === 'down' || key.name === 'j') {
      ctx.setSettingsCursor(current =>
        clampCursorIndex(ctx.filteredSettingsEntries.length, current + 1)
      )
    } else if (key.name === 'up' || key.name === 'k') {
      ctx.setSettingsCursor(current =>
        clampCursorIndex(ctx.filteredSettingsEntries.length, current - 1)
      )
    } else if (key.name === 'return' || key.name === 'e') {
      openSelectedSetting(ctx)
    }
    return true
  }

  if (ctx.modalState?.type === 'setting-options') {
    const previewIfTheme = (index: number) => {
      if (ctx.modalState?.type !== 'setting-options' || ctx.modalState.field !== 'theme') return
      ctx.previewThemeOption?.(ctx.filteredSettingOptions[index]?.value ?? null)
    }

    if (key.name === 'escape') {
      ctx.previewThemeOption?.(null)
      if (ctx.modalState.openedFrom === 'commands') {
        ctx.closeModal()
      } else {
        ctx.setModalState({ type: 'settings' })
      }
    } else if (key.name === 'down' || key.name === 'j') {
      const next = clampCursorIndex(ctx.filteredSettingOptions.length, ctx.settingOptionsCursor + 1)
      ctx.setSettingOptionsCursor(() => next)
      previewIfTheme(next)
    } else if (key.name === 'up' || key.name === 'k') {
      const next = clampCursorIndex(ctx.filteredSettingOptions.length, ctx.settingOptionsCursor - 1)
      ctx.setSettingOptionsCursor(() => next)
      previewIfTheme(next)
    } else if (key.name === 'return') {
      const option = ctx.filteredSettingOptions[ctx.settingOptionsCursor]
      if (!option) return true
      void ctx.handleSettingOptionSubmit(ctx.modalState.field, option.value)
      ctx.previewThemeOption?.(null)
    }
    return true
  }

  if (ctx.modalState?.type === 'setting-editor') {
    if (key.name === 'escape') {
      ctx.setModalState({ type: 'settings' })
      ctx.setSettingEditorError('')
    } else if (key.name === 'return') {
      void ctx.handleSettingsEditorSubmit(ctx.modalState.field)
    }
    return true
  }

  return false
}
