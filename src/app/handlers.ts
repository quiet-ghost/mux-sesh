import { executeCommand as runCommand } from './commands'
import { persistConfigUpdate, runWithErrorMessage } from './operations'
import type { Config, Item, ViewMode } from '../types'
import type { SettingsFieldId } from '../settings'
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
  sessionName: string,
  options: KillHandlerOptions
): Promise<void> {
  options.setPendingKillSessionName(null)

  await actionHandleKillSession(sessionName, {
    onSuccess: msg => options.showMessage(msg),
    onError: msg => options.showMessage(msg, 3000),
    refreshItems: () => options.refreshItems(),
  })
}

export async function handleSelectItem(item: Item, config: Config | null): Promise<void> {
  await actionHandleSelect(item, config)
}

export async function handleLastSessionWithFeedback(options: SharedHandlerOptions): Promise<void> {
  await runWithErrorMessage(
    () => actionHandleLastSession(options.sessionItems),
    'Failed to switch to the previous session',
    options.showMessage
  )
}

export async function handleRootSessionWithFeedback(
  item: Item | undefined,
  options: SharedHandlerOptions
): Promise<void> {
  await runWithErrorMessage(
    () => actionHandleRootSession(item, options.config),
    'Failed to open the root session',
    options.showMessage
  )
}

export async function handleEditTargetWithFeedback(
  item: Item | undefined,
  options: SharedHandlerOptions
): Promise<void> {
  await runWithErrorMessage(
    () => actionHandleEditTarget(item, options.config),
    'Failed to edit target',
    options.showMessage
  )
}

export async function handleRenameSubmitWithFeedback(
  renameTarget: string,
  newName: string,
  closeModal: () => void,
  options: Pick<SharedHandlerOptions, 'showMessage' | 'refreshItems'>
): Promise<void> {
  if (newName && newName !== renameTarget) {
    await actionHandleRenameSubmit(renameTarget, newName, {
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

  await runWithErrorMessage(
    () => actionHandleNewSessionSubmit(searchTerm, options.config, options.items, options.cursor),
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

export async function executeAppCommand(
  commandID: Parameters<typeof runCommand>[0],
  options: Parameters<typeof runCommand>[1]
): Promise<void> {
  await runCommand(commandID, options)
}
