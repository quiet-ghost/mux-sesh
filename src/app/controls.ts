import type { Dispatch, SetStateAction } from 'react'
import {
  closeModal as resetModalState,
  openCommandsModal as showCommandsModal,
  openRenameModal as showRenameModal,
  openSettingEditor as showSettingEditor,
  openSettingOptions as showSettingOptions,
  openSettingsModal as showSettingsModal,
  type ModalState,
} from './modals'
import type { Config } from '../types'
import type { SettingsFieldId } from '../settings'

interface AppControlsOptions {
  config: Config | null
  pendingKillSessionName: string | null
  handleKillSession: (sessionName: string) => Promise<void>
  setPendingKillSessionName: Dispatch<SetStateAction<string | null>>
  setRenameTarget: Dispatch<SetStateAction<string>>
  setModalInputValue: Dispatch<SetStateAction<string>>
  setModalState: Dispatch<SetStateAction<ModalState>>
  setCommandsSearchQuery: Dispatch<SetStateAction<string>>
  setCommandsCursor: Dispatch<SetStateAction<number>>
  setSettingEditorError: Dispatch<SetStateAction<string>>
  setSettingsSearchQuery: Dispatch<SetStateAction<string>>
  setSettingsCursor: Dispatch<SetStateAction<number>>
  setSettingOptionsSearchQuery: Dispatch<SetStateAction<string>>
  setSettingOptionsCursor: Dispatch<SetStateAction<number>>
  setSettingEditorValue: Dispatch<SetStateAction<string>>
}

export function createAppControls(options: AppControlsOptions) {
  function clearPendingKill() {
    options.setPendingKillSessionName(null)
  }

  function requestKillSession(sessionName: string) {
    if (options.pendingKillSessionName === sessionName) {
      void options.handleKillSession(sessionName)
      return
    }

    options.setPendingKillSessionName(sessionName)
  }

  function openRenameModal(sessionName: string) {
    showRenameModal(
      sessionName,
      clearPendingKill,
      options.setRenameTarget,
      options.setModalInputValue,
      options.setModalState
    )
  }

  function openCommandsModal() {
    showCommandsModal(
      clearPendingKill,
      options.setCommandsSearchQuery,
      options.setCommandsCursor,
      options.setModalState
    )
  }

  function openSettingsModal() {
    showSettingsModal(
      options.config,
      clearPendingKill,
      options.setSettingEditorError,
      options.setSettingsSearchQuery,
      options.setSettingsCursor,
      options.setModalState
    )
  }

  function openSettingOptions(field: SettingsFieldId) {
    showSettingOptions(
      field,
      options.setSettingOptionsSearchQuery,
      options.setSettingOptionsCursor,
      options.setModalState
    )
  }

  function openSettingEditor(field: SettingsFieldId) {
    showSettingEditor(
      options.config,
      field,
      options.setSettingEditorError,
      options.setSettingEditorValue,
      options.setModalState
    )
  }

  function closeModal() {
    resetModalState({
      setModalState: options.setModalState,
      setModalInputValue: options.setModalInputValue,
      setCommandsSearchQuery: options.setCommandsSearchQuery,
      setCommandsCursor: options.setCommandsCursor,
      setSettingsSearchQuery: options.setSettingsSearchQuery,
      setSettingsCursor: options.setSettingsCursor,
      setSettingOptionsSearchQuery: options.setSettingOptionsSearchQuery,
      setSettingOptionsCursor: options.setSettingOptionsCursor,
      setSettingEditorValue: options.setSettingEditorValue,
      setSettingEditorError: options.setSettingEditorError,
      setRenameTarget: options.setRenameTarget,
    })
  }

  return {
    clearPendingKill,
    requestKillSession,
    openRenameModal,
    openCommandsModal,
    openSettingsModal,
    openSettingOptions,
    openSettingEditor,
    closeModal,
  }
}
