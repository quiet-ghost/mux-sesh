import type { Dispatch, SetStateAction } from 'react'
import type { SettingChange } from '../settings/setting-change'
import { StringList } from '../settings/setting-lists'
import { Rules } from '../settings/setting-rules'
import {
  getSettingEditorTitle,
  type ListSettingId,
  type RulesSettingId,
  type SettingCollection,
  type SettingsFieldId,
} from '../settings/settings-catalog'
import type { Config, ViewMode } from '../types'
import { clampCursorIndex } from '../ui/list-window'
import type { ListPaneActionId, RulePaneActionId } from './dialog-actions'
import { ActionOutcome, type OperationReport } from './action-outcome'
import type { ModalState } from './modals'
import type { ShowToast } from './notifications'
import { persistConfigUpdate } from './toast-operations'
import { OptionPicker } from './option-picker'
import {
  SettingPane,
  type FieldCheck,
  type SettingListPane,
  type SettingRulePane,
  type SettingRulesPane,
} from './setting-panes'

// A key's action, tagged by the kind of pane that offered it.
export type SettingPaneAction =
  | { readonly pane: 'list'; readonly id: ListPaneActionId }
  | { readonly pane: 'rule'; readonly id: RulePaneActionId }

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

// How one save reports back to the pane that started it.
interface PaneSave {
  readonly field: SettingsFieldId
  // The open field's text was refused; it stays open with the reason.
  readonly rejected: (message: string, draft: string) => void
  readonly picker: (picker: OptionPicker) => void
  // Runs on the pane as it is once the save succeeded, or at once when nothing changed.
  readonly done: () => void
}

const BROWSING = { kind: 'browsing' } as const
const TYPING: FieldCheck = { kind: 'typing' }

type Update<P> = (pane: P) => ModalState

// A save that finishes after its pane closed or moved on must not reopen or relabel it.
function withinList(
  field: ListSettingId,
  update: Update<SettingListPane>
): SetStateAction<ModalState> {
  return current =>
    current?.type === 'setting-list' && current.field === field ? update(current) : current
}

function withinRules(
  field: RulesSettingId,
  update: Update<SettingRulesPane>
): SetStateAction<ModalState> {
  return current =>
    current?.type === 'setting-rules' && current.field === field ? update(current) : current
}

function withinRule(
  field: RulesSettingId,
  index: number,
  update: Update<SettingRulePane>
): SetStateAction<ModalState> {
  return current =>
    current?.type === 'setting-rule' && current.field === field && current.index === index
      ? update(current)
      : current
}

function rejectedStep<S extends { readonly kind: string }>(
  step: S,
  message: string,
  draft: string
): S {
  return 'check' in step ? { ...step, check: { kind: 'rejected', message, draft } } : step
}

export function createSettingPaneActions(options: SettingPaneActionOptions) {
  const { homeDir } = options

  function openSettingPane(collection: SettingCollection): void {
    options.setDraft('')
    options.setModalState(
      collection.kind === 'list'
        ? SettingPane.openList(collection.id)
        : SettingPane.openRules(collection.id)
    )
  }

  // One save at a time; the pane's value changes only after the save succeeded.
  async function save(change: SettingChange, target: PaneSave): Promise<void> {
    switch (change.kind) {
      case 'invalid':
        target.rejected(change.message, options.readDraft())

        return
      case 'unchanged':
        target.done()

        return
      case 'changed':
        break
    }

    const title = getSettingEditorTitle(target.field)
    const draft = { value: title, label: title }
    target.picker(OptionPicker.saving(draft))

    const outcome = await persistConfigUpdate(
      change.config,
      `${title} updated`,
      options.saveConfig,
      options.setConfig,
      options.refreshItems
    )

    if (outcome.kind === 'failed') {
      target.picker(OptionPicker.saveFailed(draft, outcome.message))
    } else {
      target.picker(OptionPicker.browsing)
      target.done()
    }

    ActionOutcome.present(outcome, options)
  }

  function listSave(pane: SettingListPane, done: Update<SettingListPane>): PaneSave {
    const update = (change: Update<SettingListPane>) =>
      options.setModalState(withinList(pane.field, change))

    return {
      field: pane.field,
      rejected: (message, draft) =>
        update(current => ({ ...current, step: rejectedStep(current.step, message, draft) })),
      picker: picker => update(current => ({ ...current, picker })),
      done: () => update(done),
    }
  }

  function rulesSave(pane: SettingRulesPane, done: Update<SettingRulesPane>): PaneSave {
    const update = (change: Update<SettingRulesPane>) =>
      options.setModalState(withinRules(pane.field, change))

    return {
      field: pane.field,
      rejected: (message, draft) =>
        update(current => ({ ...current, step: rejectedStep(current.step, message, draft) })),
      picker: picker => update(current => ({ ...current, picker })),
      done: () => update(done),
    }
  }

  function ruleSave(pane: SettingRulePane, done: Update<SettingRulePane>): PaneSave {
    const update = (change: Update<SettingRulePane>) =>
      options.setModalState(withinRule(pane.field, pane.index, change))

    return {
      field: pane.field,
      rejected: (message, draft) =>
        update(current => ({ ...current, step: rejectedStep(current.step, message, draft) })),
      picker: picker => update(current => ({ ...current, picker })),
      done: () => update(done),
    }
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
    const item = items[cursor]
    const saving = pane.picker.kind === 'saving'

    const update = (change: Update<SettingListPane>) =>
      options.setModalState(withinList(field, change))

    switch (action) {
      case 'list-move':
        update(current => ({
          ...current,
          cursor: clampCursorIndex(items.length + 2, cursor + direction),
        }))

        return
      case 'list-edit':
        if (item === undefined) return
        options.setDraft(StringList.display(field, item, homeDir))
        update(current => ({ ...current, step: { kind: 'editing', index: cursor, check: TYPING } }))

        return
      case 'list-open':
      case 'list-add':
        if (action === 'list-open' && SettingPane.rowKind(cursor, items.length) === 'json') {
          options.openJsonEditor(field)

          return
        }

        options.setDraft('')
        update(current => ({ ...current, step: { kind: 'adding', check: TYPING } }))

        return
      case 'list-remove':
        if (item === undefined) return
        update(current => ({ ...current, step: { kind: 'confirming', index: cursor } }))

        return
      case 'list-reorder':
        if (item === undefined || saving) return
        await save(
          StringList.move(config, field, cursor, direction, homeDir),
          listSave(pane, current => ({
            ...current,
            cursor: clampCursorIndex(items.length, cursor + direction),
          }))
        )

        return
      case 'list-back':
        options.returnToSettings()

        return
      case 'confirm-remove':
        if (step.kind !== 'confirming' || saving) return
        await save(
          StringList.remove(config, field, step.index, homeDir),
          listSave(pane, current => ({
            ...current,
            step: BROWSING,
            cursor: clampCursorIndex(items.length - 1, step.index),
          }))
        )

        return
      case 'confirm-keep':
      case 'field-cancel':
        update(current => ({ ...current, step: BROWSING, picker: OptionPicker.browsing }))

        return
      case 'field-apply':
        if (step.kind !== 'editing' || saving) return
        await save(
          StringList.replace(config, field, step.index, options.readDraft(), homeDir),
          listSave(pane, current => ({ ...current, step: BROWSING, cursor: step.index }))
        )

        return
      case 'field-add':
        if (step.kind !== 'adding' || saving) return
        await save(
          StringList.add(config, field, options.readDraft(), homeDir),
          listSave(pane, current => ({ ...current, step: BROWSING, cursor: items.length }))
        )
    }
  }

  async function runRules(
    config: Config,
    pane: SettingRulesPane,
    action: ListPaneActionId,
    direction: 1 | -1
  ): Promise<void> {
    const { field, step } = pane
    const entries = Rules.entries(config, field)
    const cursor = SettingPane.listCursor(config, pane)
    const entry = entries[cursor]
    const saving = pane.picker.kind === 'saving'

    const update = (change: Update<SettingRulesPane>) =>
      options.setModalState(withinRules(field, change))

    switch (action) {
      case 'list-move':
        update(current => ({
          ...current,
          cursor: clampCursorIndex(entries.length + 2, cursor + direction),
        }))

        return
      case 'list-edit':
        if (entry === undefined) return
        options.setModalState(SettingPane.openRule(field, cursor))

        return
      case 'list-open':
      case 'list-add':
        if (action === 'list-open' && SettingPane.rowKind(cursor, entries.length) === 'json') {
          options.openJsonEditor(field)

          return
        }

        options.setDraft('')
        update(current => ({ ...current, step: { kind: 'adding', check: TYPING } }))

        return
      case 'list-remove':
        if (entry === undefined) return
        update(current => ({ ...current, step: { kind: 'confirming', index: cursor } }))

        return
      case 'list-reorder':
        if (entry === undefined || saving) return
        await save(
          Rules.move(config, field, cursor, direction, homeDir),
          rulesSave(pane, current => ({
            ...current,
            cursor: clampCursorIndex(entries.length, cursor + direction),
          }))
        )

        return
      case 'list-back':
        options.returnToSettings()

        return
      case 'confirm-remove':
        if (step.kind !== 'confirming' || saving) return
        await save(
          Rules.remove(config, field, step.index, homeDir),
          rulesSave(pane, current => ({
            ...current,
            step: BROWSING,
            cursor: clampCursorIndex(entries.length - 1, step.index),
          }))
        )

        return
      case 'confirm-keep':
      case 'field-cancel':
        update(current => ({ ...current, step: BROWSING, picker: OptionPicker.browsing }))

        return
      case 'field-add':
        if (step.kind !== 'adding' || saving) return
        // The new rule's form opens on Session name: its path is already set.
        await save(
          Rules.add(config, field, options.readDraft(), homeDir),
          rulesSave(pane, () => SettingPane.openRule(field, entries.length, 1))
        )

        return
      case 'field-apply':
        return
    }
  }

  async function runRule(
    config: Config,
    pane: SettingRulePane,
    action: RulePaneActionId,
    direction: 1 | -1
  ): Promise<void> {
    const { field, index, step } = pane
    const rows = SettingPane.formRows(config, pane, homeDir)
    const cursor = SettingPane.formCursor(config, pane, homeDir)
    const row = rows[cursor]
    const entry = Rules.entries(config, field)[index]
    const saving = pane.picker.kind === 'saving'

    const update = (change: Update<SettingRulePane>) =>
      options.setModalState(withinRule(field, index, change))

    switch (action) {
      case 'rule-move':
        update(current => ({
          ...current,
          cursor: clampCursorIndex(rows.length, cursor + direction),
        }))

        return
      case 'rule-edit': {
        const formField = row?.field

        if (!entry || formField === undefined || formField === 'listed') return
        options.setDraft(Rules.draftOf(entry, formField, homeDir))
        update(current => ({
          ...current,
          step: { kind: 'editing', field: formField, check: TYPING },
        }))

        return
      }

      case 'rule-toggle':
        if (saving) return
        await save(
          Rules.toggle(config, field, index, homeDir),
          ruleSave(pane, current => current)
        )

        return
      case 'rule-reset':
        if (!row || saving) return
        await save(
          Rules.clear(config, field, index, row.field, homeDir),
          ruleSave(pane, current => current)
        )

        return
      case 'rule-back':
        options.setModalState(SettingPane.openRules(field, index))

        return
      case 'field-apply':
        if (step.kind !== 'editing' || saving) return
        await save(
          Rules.setText(config, field, index, step.field, options.readDraft(), homeDir),
          ruleSave(pane, current => ({ ...current, step: BROWSING }))
        )

        return
      case 'field-cancel':
        update(current => ({ ...current, step: BROWSING, picker: OptionPicker.browsing }))

        return
      case 'field-add':
        return
    }
  }

  async function handleSettingPaneAction(action: SettingPaneAction, direction: 1 | -1) {
    const { config, modalState } = options

    if (!config) return

    if (action.pane === 'list') {
      if (modalState?.type === 'setting-list') {
        await runList(config, modalState, action.id, direction)
      } else if (modalState?.type === 'setting-rules') {
        await runRules(config, modalState, action.id, direction)
      }
    } else if (modalState?.type === 'setting-rule') {
      await runRule(config, modalState, action.id, direction)
    }
  }

  return { openSettingPane, handleSettingPaneAction }
}
