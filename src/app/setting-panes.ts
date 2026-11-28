import { statSync } from 'fs'
import { StringList, type ListContext } from '../setting-lists'
import { getSettingDescription, getSettingEditorTitle, type ListSettingId } from '../settings'
import type { Config, Item, KeybindMode } from '../types'
import { clampCursorIndex } from '../ui/list-window'
import {
  getDialogHints,
  type DialogHint,
  type DialogView,
  type ListRowKind,
} from './action-catalog'
import type { ModalState } from './modals'
import { OptionPicker } from './option-picker'

// A field's last refused apply, kept while its text is unchanged; typing again clears it.
export type FieldCheck =
  | { readonly kind: 'typing' }
  | { readonly kind: 'rejected'; readonly message: string; readonly draft: string }

export type SettingListStep =
  | { readonly kind: 'browsing' }
  | { readonly kind: 'confirming'; readonly index: number }
  | { readonly kind: 'editing'; readonly index: number; readonly check: FieldCheck }
  | { readonly kind: 'adding'; readonly check: FieldCheck }

// A list setting's own pane; its rows are the entries, then "Add …", then "Edit as JSON…".
export interface SettingListPane {
  readonly type: 'setting-list'
  readonly field: ListSettingId
  readonly cursor: number
  readonly step: SettingListStep
  readonly picker: OptionPicker
}

export type SettingPane = SettingListPane

export type PaneTone = 'muted' | 'text' | 'danger'

export interface PaneLine {
  readonly text: string
  readonly tone: PaneTone
}

export type ListPaneRow =
  | { readonly kind: 'item'; readonly key: string; readonly label: string; readonly value: string }
  | { readonly kind: 'add' | 'json'; readonly key: string; readonly label: string }

export interface ListPaneModel {
  readonly title: string
  readonly description: string
  readonly rows: readonly ListPaneRow[]
  readonly cursor: number
  // The row replaced by a text field while one is open.
  readonly fieldRow: number | undefined
  readonly placeholder: string
  readonly detail: PaneLine | undefined
  readonly hints: readonly DialogHint[]
}

export type SettingPaneView = Extract<DialogView, { kind: 'setting-list' }>

export interface SettingPaneState {
  readonly view: SettingPaneView | undefined
  readonly model: ListPaneModel | undefined
}

export interface SettingPaneInput {
  readonly config: Config | null
  readonly modalState: ModalState
  readonly draft: string
  readonly homeDir: string
  readonly liveSessions: readonly Item[]
  readonly projects: readonly Item[]
  readonly folderExists?: (path: string) => boolean
}

const JSON_ROW = 'Edit as JSON…'

// An unreadable folder is treated as missing: it is not scanned either way.
export function folderExists(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function rowKind(cursor: number, count: number): ListRowKind {
  if (cursor < count) return 'item'

  return cursor === count ? 'add' : 'json'
}

function listRowCount(config: Config, pane: SettingListPane): number {
  return StringList.items(config, pane.field).length + 2
}

function listCursor(config: Config, pane: SettingListPane): number {
  return clampCursorIndex(listRowCount(config, pane), pane.cursor)
}

function stepKind(step: SettingListStep): SettingPaneView['step'] {
  return step.kind
}

function listView(
  config: Config,
  pane: SettingListPane,
  keybindMode: KeybindMode
): SettingPaneView {
  const count = StringList.items(config, pane.field).length

  return {
    kind: 'setting-list',
    row: rowKind(listCursor(config, pane), count),
    step: stepKind(pane.step),
    keybindMode,
  }
}

function pickerLine(picker: OptionPicker): PaneLine | undefined {
  switch (picker.kind) {
    case 'browsing':
      return undefined
    case 'saving':
      return { text: `Saving ${picker.draft.label}…`, tone: 'muted' }
    case 'save-failed':
      return { text: picker.reason, tone: 'danger' }
  }
}

// What the open field says about its text: a refusal of exactly this text, then a live problem.
function fieldLine(
  config: Config,
  pane: SettingListPane,
  check: FieldCheck,
  input: SettingPaneInput,
  context: ListContext,
  except: number | undefined
): PaneLine | undefined {
  if (check.kind === 'rejected' && check.draft === input.draft) {
    return { text: check.message, tone: 'danger' }
  }

  const live = StringList.check(config, pane.field, input.draft, input.homeDir, context, except)

  switch (live.kind) {
    case 'ok':
    case 'empty':
      return { text: StringList.typingHint(pane.field), tone: 'muted' }
    case 'invalid':
      return { text: live.message, tone: 'danger' }
    case 'warning':
      return { text: live.message, tone: 'muted' }
  }
}

function rowLine(
  config: Config,
  pane: SettingListPane,
  cursor: number,
  context: ListContext
): PaneLine | undefined {
  const items = StringList.items(config, pane.field)
  const item = items[cursor]

  if (item !== undefined)
    return { text: StringList.detail(pane.field, item, context), tone: 'muted' }

  return cursor === items.length
    ? { text: `Adds one to the end of ${getSettingEditorTitle(pane.field)}`, tone: 'muted' }
    : { text: 'Edit the whole list as JSON', tone: 'muted' }
}

function listDetail(
  config: Config,
  pane: SettingListPane,
  cursor: number,
  input: SettingPaneInput,
  context: ListContext
): PaneLine | undefined {
  const picker = pickerLine(pane.picker)

  if (picker) return picker

  const { step } = pane
  const items = StringList.items(config, pane.field)

  switch (step.kind) {
    case 'browsing':
      return rowLine(config, pane, cursor, context)
    case 'confirming': {
      const item = items[step.index]

      return item === undefined
        ? undefined
        : { text: StringList.removePrompt(pane.field, item, input.homeDir), tone: 'text' }
    }

    case 'editing':
      return fieldLine(config, pane, step.check, input, context, step.index)
    case 'adding':
      return fieldLine(config, pane, step.check, input, context, undefined)
  }
}

function fieldRowOf(step: SettingListStep, count: number): number | undefined {
  switch (step.kind) {
    case 'editing':
      return step.index
    case 'adding':
      return count
    case 'browsing':
    case 'confirming':
      return undefined
  }
}

function listModel(
  config: Config,
  pane: SettingListPane,
  input: SettingPaneInput,
  view: SettingPaneView
): ListPaneModel {
  const context: ListContext = {
    liveSessions: input.liveSessions,
    projects: input.projects,
    folderExists: input.folderExists ?? folderExists,
  }

  const items = StringList.items(config, pane.field)
  const cursor = listCursor(config, pane)

  const rows: ListPaneRow[] = [
    ...items.map((item, index): ListPaneRow => ({
      kind: 'item',
      key: `${index}:${item}`,
      label: StringList.display(pane.field, item, input.homeDir),
      value: StringList.status(pane.field, item, context),
    })),
    { kind: 'add', key: 'add', label: StringList.addLabel(pane.field) },
    { kind: 'json', key: 'json', label: JSON_ROW },
  ]

  return {
    title: getSettingEditorTitle(pane.field),
    description: getSettingDescription(pane.field),
    rows,
    cursor,
    fieldRow: fieldRowOf(pane.step, items.length),
    placeholder: StringList.placeholder(pane.field),
    detail: listDetail(config, pane, cursor, input, context),
    hints: getDialogHints(view),
  }
}

const NO_PANE: SettingPaneState = { view: undefined, model: undefined }

// The list or rule pane on screen: the keys it offers and what it draws.
export function getSettingPaneState(input: SettingPaneInput): SettingPaneState {
  const { config, modalState } = input

  if (!config || modalState?.type !== 'setting-list') return NO_PANE

  const view = listView(config, modalState, config.keybindMode ?? 'vim')

  return { view, model: listModel(config, modalState, input, view) }
}

function open(field: ListSettingId): SettingListPane {
  return {
    type: 'setting-list',
    field,
    cursor: 0,
    step: { kind: 'browsing' },
    picker: OptionPicker.browsing,
  }
}

export const SettingPane = { open, rowKind, listCursor } as const
