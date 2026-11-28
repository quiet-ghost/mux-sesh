import type { Dispatch, SetStateAction } from 'react'
import type { SettingChange } from '../setting-change'
import { StringList } from '../setting-lists'
import { getSettingEditorTitle, type ListSettingId, type SettingsFieldId } from '../settings'
import type { Config, ViewMode } from '../types'
import { clampCursorIndex } from '../ui/list-window'
import type { ListPaneActionId } from './action-catalog'
import { ActionOutcome, type OperationReport } from './action-outcome'
import type { ModalState } from './modals'
import type { ShowToast } from './notifications'
import { persistConfigUpdate } from './operations'
import { OptionPicker } from './option-picker'
import { SettingPane, type SettingListPane } from './setting-panes'

export interface SettingPaneActionOptions {
  config: Config | null
  homeDir: string
  modalState: ModalState
  setModalState: Dispatch<SetStateAction<ModalState>>
  // The open field's text as typed, read when the key is handled.
  readDraft: () => string
  setDraft: (text: string) => void
  // "Edit as JSON…": the JSON editor for the whole setting.
  openJsonEditor: (field: SettingsFieldId) => void
  // Back to Settings on the row that opened the pane.
  returnToSettings: () => void
  saveConfig: (config: Config) => Promise<void>
  setConfig: (config: Config) => void
  refreshItems: (forceViewMode?: ViewMode, nextConfig?: Config | null) => Promise<void>
  showToast: ShowToast
  showOutcome: (report: OperationReport) => void
}

type ListUpdate = (pane: SettingListPane) => SettingListPane

// A save that finishes after the pane closed or changed setting must not reopen or relabel it.
function withinList(field: ListSettingId, update: ListUpdate): SetStateAction<ModalState> {
  return current =>
    current?.type === 'setting-list' && current.field === field ? update(current) : current
}

const BROWSING = { kind: 'browsing' } as const

export function createSettingPaneActions(options: SettingPaneActionOptions) {
  function openSettingPane(field: ListSettingId): void {
    options.setDraft('')
    options.setModalState(SettingPane.open(field))
  }

  function update(pane: SettingListPane, change: ListUpdate): void {
    options.setModalState(withinList(pane.field, change))
  }

  // Saves one change at a time; `after` runs on the pane as it is once the save succeeded.
  async function save(pane: SettingListPane, change: SettingChange, after: ListUpdate) {
    switch (change.kind) {
      case 'invalid': {
        const message = change.message
        const draft = options.readDraft()

        update(pane, current => {
          const { step } = current

          if (step.kind !== 'editing' && step.kind !== 'adding') return current

          return { ...current, step: { ...step, check: { kind: 'rejected', message, draft } } }
        })

        return
      }

      case 'unchanged':
        update(pane, after)

        return
      case 'changed':
        break
    }

    const title = getSettingEditorTitle(pane.field)
    const draft = { value: title, label: title }
    update(pane, current => ({ ...current, picker: OptionPicker.saving(draft) }))

    const outcome = await persistConfigUpdate(
      change.config,
      `${title} updated`,
      options.saveConfig,
      options.setConfig,
      options.refreshItems
    )

    if (outcome.kind === 'failed') {
      update(pane, current => ({
        ...current,
        picker: OptionPicker.saveFailed(draft, outcome.message),
      }))
    } else {
      update(pane, current => after({ ...current, picker: OptionPicker.browsing }))
    }

    ActionOutcome.present(outcome, options)
  }

  async function runList(
    config: Config,
    pane: SettingListPane,
    action: ListPaneActionId,
    direction: 1 | -1
  ): Promise<void> {
    const { field, step } = pane
    const items = StringList.items(config, field)
    const cursor = SettingPane.listCursor(config, pane)
    const row = SettingPane.rowKind(cursor, items.length)
    const item = items[cursor]
    const saving = pane.picker.kind === 'saving'

    switch (action) {
      case 'list-move':
        update(pane, current => ({
          ...current,
          cursor: clampCursorIndex(items.length + 2, cursor + direction),
        }))

        return
      case 'list-edit':
        if (item === undefined) return
        options.setDraft(StringList.display(field, item, options.homeDir))
        update(pane, current => ({
          ...current,
          step: { kind: 'editing', index: cursor, check: { kind: 'typing' } },
        }))

        return
      case 'list-open':
        if (row === 'json') {
          options.openJsonEditor(field)

          return
        }

        startAdding(pane)

        return
      case 'list-add':
        startAdding(pane)

        return
      case 'list-remove':
        if (item === undefined) return
        update(pane, current => ({ ...current, step: { kind: 'confirming', index: cursor } }))

        return
      case 'list-reorder':
        if (item === undefined || saving) return
        await save(
          pane,
          StringList.move(config, field, cursor, direction, options.homeDir),
          current => ({
            ...current,
            cursor: clampCursorIndex(items.length, cursor + direction),
          })
        )

        return
      case 'list-back':
        options.returnToSettings()

        return
      case 'confirm-remove':
        if (step.kind !== 'confirming' || saving) return
        await save(
          pane,
          StringList.remove(config, field, step.index, options.homeDir),
          current => ({
            ...current,
            step: BROWSING,
            cursor: clampCursorIndex(items.length - 1, step.index),
          })
        )

        return
      case 'confirm-keep':
      case 'field-cancel':
        update(pane, current => ({ ...current, step: BROWSING, picker: OptionPicker.browsing }))

        return
      case 'field-apply':
        if (step.kind !== 'editing' || saving) return
        await save(
          pane,
          StringList.replace(config, field, step.index, options.readDraft(), options.homeDir),
          current => ({ ...current, step: BROWSING, cursor: step.index })
        )

        return
      case 'field-add':
        if (step.kind !== 'adding' || saving) return
        await save(
          pane,
          StringList.add(config, field, options.readDraft(), options.homeDir),
          current => ({
            ...current,
            step: BROWSING,
            cursor: items.length,
          })
        )
    }
  }

  function startAdding(pane: SettingListPane): void {
    options.setDraft('')
    update(pane, current => ({ ...current, step: { kind: 'adding', check: { kind: 'typing' } } }))
  }

  async function handleSettingPaneAction(action: ListPaneActionId, direction: 1 | -1) {
    const { config, modalState } = options

    if (!config || modalState?.type !== 'setting-list') return

    await runList(config, modalState, action, direction)
  }

  return { openSettingPane, handleSettingPaneAction }
}
