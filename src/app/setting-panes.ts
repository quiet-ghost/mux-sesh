import { statSync } from 'fs'
import { StringList, type ListContext } from '../settings/setting-lists'
import { Rules, type RuleFormRow, type RuleTextField } from '../settings/setting-rules'
import {
  getSettingDescription,
  getSettingEditorTitle,
  type ListSettingId,
  type RulesSettingId,
} from '../settings/settings-catalog'
import type { Config, Item, KeybindMode } from '../types'
import { clampCursorIndex } from '../ui/list-window'
import {
  getDialogHints,
  type DialogHint,
  type DialogView,
  type ListRowKind,
  type RuleRowControl,
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

// A rule has no draft: adding asks for its path or pattern first, then opens its form.
export type RuleListStep =
  | { readonly kind: 'browsing' }
  | { readonly kind: 'confirming'; readonly index: number }
  | { readonly kind: 'adding'; readonly check: FieldCheck }

export interface SettingRulesPane {
  readonly type: 'setting-rules'
  readonly field: RulesSettingId
  readonly cursor: number
  readonly step: RuleListStep
  readonly picker: OptionPicker
}

export type RuleFormStep =
  | { readonly kind: 'browsing' }
  | { readonly kind: 'editing'; readonly field: RuleTextField; readonly check: FieldCheck }

// One rule's form; every field saves when it is applied.
export interface SettingRulePane {
  readonly type: 'setting-rule'
  readonly field: RulesSettingId
  readonly index: number
  readonly cursor: number
  readonly step: RuleFormStep
  readonly picker: OptionPicker
}

export type SettingPane = SettingListPane | SettingRulesPane | SettingRulePane

export type PaneTone = 'muted' | 'text' | 'danger'

export interface PaneLine {
  readonly text: string
  readonly tone: PaneTone
}

export type ListPaneRow =
  | { readonly kind: 'item'; readonly key: string; readonly label: string; readonly value: string }
  | { readonly kind: 'add' | 'json'; readonly key: string; readonly label: string }

export interface ListPaneModel {
  readonly kind: 'list'
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

// The path or pattern a new rule asks for before it exists.
export interface AddRuleModel {
  readonly kind: 'add-rule'
  readonly title: string
  readonly description: string
  readonly placeholder: string
  readonly detail: PaneLine | undefined
  readonly hints: readonly DialogHint[]
}

export interface RuleFormModel {
  readonly kind: 'rule-form'
  readonly title: string
  readonly description: string
  readonly rows: readonly RuleFormRow[]
  readonly cursor: number
  // The row whose value is an open text field.
  readonly fieldRow: number | undefined
  readonly detail: PaneLine | undefined
  readonly hints: readonly DialogHint[]
}

export type SettingPaneModel = ListPaneModel | AddRuleModel | RuleFormModel

export type SettingPaneView = Extract<DialogView, { kind: 'setting-list' | 'setting-rule' }>

export interface SettingPaneState {
  readonly view: SettingPaneView | undefined
  readonly model: SettingPaneModel | undefined
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
const BROWSING = { kind: 'browsing' } as const

// An unreadable folder is treated as missing: it is not scanned either way.
function folderExists(path: string): boolean {
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

// Entries, then the add and JSON rows.
function paneRowCount(config: Config, pane: SettingListPane | SettingRulesPane): number {
  return entryCount(config, pane) + 2
}

function entryCount(config: Config, pane: SettingListPane | SettingRulesPane): number {
  return pane.type === 'setting-list'
    ? StringList.items(config, pane.field).length
    : Rules.entries(config, pane.field).length
}

function listCursor(config: Config, pane: SettingListPane | SettingRulesPane): number {
  return clampCursorIndex(paneRowCount(config, pane), pane.cursor)
}

function formRows(config: Config, pane: SettingRulePane, homeDir: string): RuleFormRow[] {
  return Rules.form(config, pane.field, pane.index, homeDir)
}

function formCursor(config: Config, pane: SettingRulePane, homeDir: string): number {
  return clampCursorIndex(formRows(config, pane, homeDir).length, pane.cursor)
}

function listView(
  config: Config,
  pane: SettingListPane | SettingRulesPane,
  keybindMode: KeybindMode
): SettingPaneView {
  return {
    kind: 'setting-list',
    row: rowKind(listCursor(config, pane), entryCount(config, pane)),
    step: pane.step.kind,
    keybindMode,
  }
}

function ruleView(config: Config, pane: SettingRulePane, homeDir: string): SettingPaneView {
  const row = formRows(config, pane, homeDir)[formCursor(config, pane, homeDir)]
  const control: RuleRowControl | undefined = row && { control: row.control, reset: row.reset }

  return { kind: 'setting-rule', row: control, step: pane.step.kind }
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

type LiveCheck = ReturnType<typeof StringList.check>

// What an open field says about its text: a refusal of exactly this text, then a live problem,
// then what to type.
function fieldLine(
  check: FieldCheck,
  draft: string,
  live: LiveCheck,
  typing: string
): PaneLine | undefined {
  if (check.kind === 'rejected' && check.draft === draft) {
    return { text: check.message, tone: 'danger' }
  }

  switch (live.kind) {
    case 'ok':
    case 'empty':
      return { text: typing, tone: 'muted' }
    case 'invalid':
      return { text: live.message, tone: 'danger' }
    case 'warning':
      return { text: live.message, tone: 'muted' }
  }
}

function listContext(input: SettingPaneInput): ListContext {
  return {
    liveSessions: input.liveSessions,
    projects: input.projects,
    folderExists: input.folderExists ?? folderExists,
  }
}

function stringRowLine(
  config: Config,
  pane: SettingListPane,
  cursor: number,
  context: ListContext
): PaneLine {
  const items = StringList.items(config, pane.field)
  const item = items[cursor]

  if (item !== undefined)
    return { text: StringList.detail(pane.field, item, context), tone: 'muted' }

  return cursor === items.length
    ? { text: `Adds one to the end of ${getSettingEditorTitle(pane.field)}`, tone: 'muted' }
    : { text: 'Edit the whole list as JSON', tone: 'muted' }
}

function stringListDetail(
  config: Config,
  pane: SettingListPane,
  cursor: number,
  input: SettingPaneInput,
  context: ListContext
): PaneLine | undefined {
  const { step, field } = pane
  const items = StringList.items(config, field)
  const typing = StringList.typingHint(field)

  switch (step.kind) {
    case 'browsing':
      return stringRowLine(config, pane, cursor, context)
    case 'confirming': {
      const item = items[step.index]

      return item === undefined
        ? undefined
        : { text: StringList.removePrompt(field, item, input.homeDir), tone: 'text' }
    }

    case 'editing': {
      const live = StringList.check(config, field, input.draft, input.homeDir, context, step.index)

      return fieldLine(step.check, input.draft, live, typing)
    }

    case 'adding': {
      const live = StringList.check(config, field, input.draft, input.homeDir, context)

      return fieldLine(step.check, input.draft, live, typing)
    }
  }
}

function stringFieldRow(step: SettingListStep, count: number): number | undefined {
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

function stringListModel(
  config: Config,
  pane: SettingListPane,
  input: SettingPaneInput,
  view: SettingPaneView
): ListPaneModel {
  const context = listContext(input)
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
    kind: 'list',
    title: getSettingEditorTitle(pane.field),
    description: getSettingDescription(pane.field),
    rows,
    cursor,
    fieldRow: stringFieldRow(pane.step, items.length),
    placeholder: StringList.placeholder(pane.field),
    detail: pickerLine(pane.picker) ?? stringListDetail(config, pane, cursor, input, context),
    hints: getDialogHints(view),
  }
}

function ruleNoun(field: RulesSettingId): string {
  return field === 'projects' ? 'project rule' : 'wildcard rule'
}

function ruleRowLine(config: Config, pane: SettingRulesPane, cursor: number): PaneLine {
  const entries = Rules.entries(config, pane.field)
  const entry = entries[cursor]

  if (entry) return { text: Rules.detail(entry), tone: 'muted' }

  return cursor === entries.length
    ? { text: `Adds a ${ruleNoun(pane.field)}; its path comes first`, tone: 'muted' }
    : { text: 'Edit every rule as JSON', tone: 'muted' }
}

function rulesListModel(
  config: Config,
  pane: SettingRulesPane,
  input: SettingPaneInput,
  view: SettingPaneView
): ListPaneModel {
  const entries = Rules.entries(config, pane.field)
  const cursor = listCursor(config, pane)
  const { step } = pane

  const rows: ListPaneRow[] = [
    ...entries.map((entry, index): ListPaneRow => ({
      kind: 'item',
      key: `${index}:${entry.key}`,
      label: Rules.display(entry, input.homeDir),
      value: Rules.summary(entry),
    })),
    { kind: 'add', key: 'add', label: 'Add rule…' },
    { kind: 'json', key: 'json', label: JSON_ROW },
  ]

  const confirming = step.kind === 'confirming' ? entries[step.index] : undefined

  const detail = confirming
    ? { text: Rules.removePrompt(pane.field, confirming, input.homeDir), tone: 'text' as const }
    : ruleRowLine(config, pane, cursor)

  return {
    kind: 'list',
    title: getSettingEditorTitle(pane.field),
    description: getSettingDescription(pane.field),
    rows,
    cursor,
    fieldRow: undefined,
    placeholder: '',
    detail: pickerLine(pane.picker) ?? detail,
    hints: getDialogHints(view),
  }
}

function addRuleModel(
  config: Config,
  pane: SettingRulesPane,
  check: FieldCheck,
  input: SettingPaneInput,
  view: SettingPaneView
): AddRuleModel {
  const projects = pane.field === 'projects'

  const live = Rules.checkKey(
    config,
    pane.field,
    input.draft,
    input.homeDir,
    input.folderExists ?? folderExists
  )

  return {
    kind: 'add-rule',
    title: `Add ${ruleNoun(pane.field)}`,
    description: projects
      ? 'The folder this rule applies to; the other fields come next'
      : 'The glob this rule matches, such as ~/work/**; the other fields come next',
    placeholder: projects ? 'A folder, such as ~/work/api' : 'A glob, such as ~/work/**',
    detail:
      pickerLine(pane.picker) ??
      fieldLine(check, input.draft, live, '~ is your home folder; ** spans folders in patterns'),
    hints: getDialogHints(view),
  }
}

function ruleFormDetail(
  config: Config,
  pane: SettingRulePane,
  row: RuleFormRow | undefined,
  input: SettingPaneInput
): PaneLine | undefined {
  const { step } = pane

  if (step.kind === 'browsing') return row && { text: row.description, tone: 'muted' }

  if (step.field !== 'key') {
    return fieldLine(step.check, input.draft, { kind: 'ok' }, row?.description ?? '')
  }

  const live = Rules.checkKey(
    config,
    pane.field,
    input.draft,
    input.homeDir,
    input.folderExists ?? folderExists,
    pane.index
  )

  return fieldLine(step.check, input.draft, live, row?.description ?? '')
}

function ruleFormModel(
  config: Config,
  pane: SettingRulePane,
  input: SettingPaneInput,
  view: SettingPaneView
): RuleFormModel | undefined {
  const entry = Rules.entries(config, pane.field)[pane.index]

  if (!entry) return undefined

  const rows = formRows(config, pane, input.homeDir)
  const cursor = formCursor(config, pane, input.homeDir)
  const { step } = pane

  const fieldRow =
    step.kind === 'editing' ? rows.findIndex(row => row.field === step.field) : undefined

  const noun = pane.field === 'projects' ? 'Project rule' : 'Wildcard rule'

  return {
    kind: 'rule-form',
    title: `${noun} · ${Rules.display(entry, input.homeDir)}`,
    description: 'Changes save as you make them',
    rows,
    cursor,
    fieldRow: fieldRow === -1 ? undefined : fieldRow,
    detail: pickerLine(pane.picker) ?? ruleFormDetail(config, pane, rows[cursor], input),
    hints: getDialogHints(view),
  }
}

const NO_PANE: SettingPaneState = { view: undefined, model: undefined }

// The list or rule pane on screen: the keys it offers and what it draws.
export function getSettingPaneState(input: SettingPaneInput): SettingPaneState {
  const { config, modalState } = input

  if (!config) return NO_PANE

  if (modalState?.type === 'setting-list') {
    const view = listView(config, modalState, config.keybindMode ?? 'vim')

    return { view, model: stringListModel(config, modalState, input, view) }
  }

  if (modalState?.type === 'setting-rules') {
    const view = listView(config, modalState, config.keybindMode ?? 'vim')
    const { step } = modalState

    const model =
      step.kind === 'adding'
        ? addRuleModel(config, modalState, step.check, input, view)
        : rulesListModel(config, modalState, input, view)

    return { view, model }
  }

  if (modalState?.type === 'setting-rule') {
    const view = ruleView(config, modalState, input.homeDir)

    return { view, model: ruleFormModel(config, modalState, input, view) }
  }

  return NO_PANE
}

function openList(field: ListSettingId): SettingListPane {
  return { type: 'setting-list', field, cursor: 0, step: BROWSING, picker: OptionPicker.browsing }
}

function openRules(field: RulesSettingId, cursor = 0): SettingRulesPane {
  return { type: 'setting-rules', field, cursor, step: BROWSING, picker: OptionPicker.browsing }
}

function openRule(field: RulesSettingId, index: number, cursor = 0): SettingRulePane {
  return {
    type: 'setting-rule',
    field,
    index,
    cursor,
    step: BROWSING,
    picker: OptionPicker.browsing,
  }
}

export const SettingPane = {
  openList,
  openRules,
  openRule,
  rowKind,
  listCursor,
  formRows,
  formCursor,
} as const
