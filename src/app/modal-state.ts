import type { TextareaRenderable } from '@opentui/core'
import { useRef, useState } from 'react'
import type { ModalState } from './modals'

export function useAppModalState() {
  const [modalState, setModalState] = useState<ModalState>(null)
  const [modalInputValue, setModalInputValue] = useState('')
  const [commandsCursor, setCommandsCursor] = useState(0)
  const [commandsSearchQuery, setCommandsSearchQuery] = useState('')
  const [settingsCursor, setSettingsCursor] = useState(0)
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('')
  const [settingOptionsCursor, setSettingOptionsCursor] = useState(0)
  const [settingOptionsSearchQuery, setSettingOptionsSearchQuery] = useState('')
  const [settingEditorValue, setSettingEditorValue] = useState('')
  const [settingEditorError, setSettingEditorError] = useState('')
  const [themePreviewId, setThemePreviewId] = useState<string | null>(null)

  const modalTextareaRef = useRef<TextareaRenderable | null>(null)
  const commandsSearchTextareaRef = useRef<TextareaRenderable | null>(null)
  const settingsSearchTextareaRef = useRef<TextareaRenderable | null>(null)
  const settingOptionsSearchTextareaRef = useRef<TextareaRenderable | null>(null)
  const settingEditorTextareaRef = useRef<TextareaRenderable | null>(null)

  return {
    modalState,
    setModalState,
    modalInputValue,
    setModalInputValue,
    commandsCursor,
    setCommandsCursor,
    commandsSearchQuery,
    setCommandsSearchQuery,
    settingsCursor,
    setSettingsCursor,
    settingsSearchQuery,
    setSettingsSearchQuery,
    settingOptionsCursor,
    setSettingOptionsCursor,
    settingOptionsSearchQuery,
    setSettingOptionsSearchQuery,
    settingEditorValue,
    setSettingEditorValue,
    settingEditorError,
    setSettingEditorError,
    themePreviewId,
    setThemePreviewId,
    modalTextareaRef,
    commandsSearchTextareaRef,
    settingsSearchTextareaRef,
    settingOptionsSearchTextareaRef,
    settingEditorTextareaRef,
  }
}
