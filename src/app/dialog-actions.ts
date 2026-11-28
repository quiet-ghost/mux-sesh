import type { SettingsEntry } from '../settings/settings-catalog'
import type { KeybindMode } from '../config/config-model'

// Settings dialogs keep a text field focused, so their actions are non-text keys only; letters
// always type. Each action declares its keys once: the dialogs' footers and modal-keyboard both
// read them here.
export type SettingsActionId =
  | 'settings-move'
  | 'settings-change'
  | 'settings-toggle'
  | 'settings-open'
  | 'settings-reset'
  | 'settings-clear'
  | 'settings-close'

export type OptionActionId = 'option-move' | 'option-apply' | 'option-back'

export type EditorActionId = 'editor-apply' | 'editor-back'

// The raw JSON editor: Enter belongs to the text, so saving takes ctrl+s.
export type JsonActionId = 'json-save' | 'json-newline' | 'json-back'

// The Icons form has no text field until a glyph is edited in place.
export type IconsActionId =
  | 'icons-move'
  | 'icons-toggle'
  | 'icons-edit'
  | 'icons-clear'
  | 'icons-back'
  | 'icons-apply'
  | 'icons-cancel'

// A list or rule list pane: no text field has focus, so single letters act.
export type ListActionId =
  | 'list-move'
  | 'list-edit'
  | 'list-open'
  | 'list-add'
  | 'list-remove'
  | 'list-reorder'
  | 'list-back'

// The inline remove confirmation.
export type ConfirmActionId = 'confirm-remove' | 'confirm-keep'

// An inline text field in a list, rule list or rule form.
export type FieldActionId = 'field-apply' | 'field-add' | 'field-cancel'

// A rule form's rows.
export type RuleActionId = 'rule-move' | 'rule-toggle' | 'rule-edit' | 'rule-reset' | 'rule-back'

export type DialogActionId =
  | SettingsActionId
  | OptionActionId
  | EditorActionId
  | ListActionId
  | ConfirmActionId
  | FieldActionId
  | RuleActionId
  | JsonActionId
  | IconsActionId

// The selected row of a list pane: an entry, the add row, or the "Edit as JSON…" row.
export type ListRowKind = 'item' | 'add' | 'json'

// What a list pane is doing: browsing rows, confirming a removal, or typing into a field.
export type ListStepKind = 'browsing' | 'confirming' | 'editing' | 'adding'

// The selected rule form row: edited as text or switched on and off, and whether it overrides.
export interface RuleRowControl {
  readonly control: 'edit' | 'toggle'
  readonly reset: 'available' | 'none'
}

// The selected Icons form row, or the glyph being edited in place.
export type IconsFormView =
  | {
      readonly mode: 'browsing'
      readonly entry: Pick<SettingsEntry, 'control' | 'reset'> | undefined
    }
  | { readonly mode: 'editing' }

// The dialog on screen, with what the selected Settings row offers.
export type DialogView =
  | {
      kind: 'settings'
      entry: Pick<SettingsEntry, 'control' | 'reset'> | undefined
      query: string
    }
  | { kind: 'setting-options' }
  | { kind: 'setting-editor' }
  | { kind: 'setting-list'; row: ListRowKind; step: ListStepKind; keybindMode: KeybindMode }
  | { kind: 'setting-rule'; row: RuleRowControl | undefined; step: 'browsing' | 'editing' }
  | { kind: 'setting-json' }
  | ({ kind: 'icons-form' } & IconsFormView)

export interface DialogKey {
  readonly name: string
  readonly ctrl: boolean
  readonly shift: boolean
  // j and k move only in vim keybind mode.
  readonly modes: 'any' | 'vim'
  // As the footer and the docs write it.
  readonly label: string
}

export interface DialogAction {
  readonly label: string
  readonly keys: readonly DialogKey[]
  // Settings moves without saying so; its footer is about the selected row.
  readonly footer: boolean
  // The footer's key text when joining the key labels would be too long.
  readonly hint?: string
}

// Shown as `label key`, like the main footer's hints.
export interface DialogHint {
  readonly label: string
  readonly key: string
}

function dialogKey(name: string, label: string, ctrl = false): DialogKey {
  return { name, ctrl, shift: false, modes: 'any', label }
}

function shifted(key: DialogKey): DialogKey {
  return { ...key, shift: true, label: `shift+${key.label}` }
}

function vimKey(name: string): DialogKey {
  return { ...dialogKey(name, name), modes: 'vim' }
}

const UP = dialogKey('up', '↑')
const DOWN = dialogKey('down', '↓')
const LEFT = dialogKey('left', '←')
const RIGHT = dialogKey('right', '→')
const ENTER = dialogKey('return', 'enter')
const ESC = dialogKey('escape', 'esc')
const CTRL_R = dialogKey('r', 'ctrl+r', true)
const KEY_A = dialogKey('a', 'a')
const KEY_D = dialogKey('d', 'd')
const KEY_J = vimKey('j')
const KEY_K = vimKey('k')
const CTRL_S = dialogKey('s', 'ctrl+s', true)

const DIALOG_ACTIONS = {
  'settings-move': { label: 'navigate', keys: [UP, DOWN], footer: false },
  'settings-change': { label: 'change', keys: [LEFT, RIGHT], footer: true },
  'settings-toggle': { label: 'change', keys: [LEFT, RIGHT, ENTER], footer: true },
  'settings-open': { label: 'open', keys: [ENTER], footer: true },
  'settings-reset': { label: 'reset', keys: [CTRL_R], footer: true },
  'settings-clear': { label: 'clear', keys: [ESC], footer: true },
  'settings-close': { label: 'close', keys: [ESC], footer: true },
  'option-move': { label: 'navigate', keys: [UP, DOWN], footer: true },
  'option-apply': { label: 'apply', keys: [ENTER], footer: true },
  'option-back': { label: 'back', keys: [ESC], footer: true },
  'editor-apply': { label: 'apply', keys: [ENTER], footer: true },
  'editor-back': { label: 'back', keys: [ESC], footer: true },
  'list-move': { label: 'navigate', keys: [UP, DOWN, KEY_K, KEY_J], footer: false },
  'list-edit': { label: 'edit', keys: [ENTER], footer: true },
  'list-open': { label: 'open', keys: [ENTER], footer: true },
  'list-add': { label: 'add', keys: [KEY_A], footer: true },
  'list-remove': { label: 'remove', keys: [KEY_D], footer: true },
  'list-reorder': {
    label: 'move',
    keys: [shifted(UP), shifted(DOWN)],
    footer: true,
    hint: 'shift+↑↓',
  },
  'list-back': { label: 'back', keys: [ESC], footer: true },
  'confirm-remove': { label: 'remove', keys: [ENTER], footer: true },
  'confirm-keep': { label: 'keep', keys: [ESC], footer: true },
  'field-apply': { label: 'apply', keys: [ENTER], footer: true },
  'field-add': { label: 'add', keys: [ENTER], footer: true },
  'field-cancel': { label: 'cancel', keys: [ESC], footer: true },
  'rule-move': { label: 'navigate', keys: [UP, DOWN], footer: false },
  'rule-toggle': { label: 'change', keys: [LEFT, RIGHT, ENTER], footer: true },
  'rule-edit': { label: 'edit', keys: [ENTER], footer: true },
  'rule-reset': { label: 'reset', keys: [CTRL_R], footer: true },
  'rule-back': { label: 'back', keys: [ESC], footer: true },
  'json-save': { label: 'save', keys: [CTRL_S], footer: true },
  'json-newline': { label: 'new line', keys: [ENTER], footer: true },
  'json-back': { label: 'back', keys: [ESC], footer: true },
  'icons-move': { label: 'navigate', keys: [UP, DOWN], footer: false },
  'icons-toggle': { label: 'change', keys: [LEFT, RIGHT, ENTER], footer: true },
  'icons-edit': { label: 'edit', keys: [ENTER], footer: true },
  'icons-clear': { label: 'clear', keys: [CTRL_R], footer: true },
  'icons-back': { label: 'back', keys: [ESC], footer: true },
  'icons-apply': { label: 'apply', keys: [ENTER], footer: true },
  'icons-cancel': { label: 'cancel', keys: [ESC], footer: true },
} as const satisfies Record<DialogActionId, DialogAction>

// In footer order. A Settings row offers ←/→ only where they change it, Enter only where it opens
// or switches, and reset only once the value differs from the default.
function settingsActions(
  entry: Pick<SettingsEntry, 'control' | 'reset'> | undefined,
  query: string
): SettingsActionId[] {
  const row: SettingsActionId[] = []

  switch (entry?.control) {
    case 'toggle':
      row.push('settings-toggle')
      break
    case 'cycle':
      row.push('settings-change', 'settings-open')
      break
    case 'step':
      row.push('settings-change')
      break
    case 'open':
      row.push('settings-open')
      break
    case undefined:
      break
  }

  if (entry?.reset === 'available') row.push('settings-reset')

  return ['settings-move', ...row, query.length > 0 ? 'settings-clear' : 'settings-close']
}

const OPTION_ACTIONS: readonly OptionActionId[] = ['option-move', 'option-apply', 'option-back']
const EDITOR_ACTIONS: readonly EditorActionId[] = ['editor-apply', 'editor-back']
const CONFIRM_ACTIONS: readonly ConfirmActionId[] = ['confirm-remove', 'confirm-keep']
const APPLY_ACTIONS: readonly FieldActionId[] = ['field-apply', 'field-cancel']
const ADD_ACTIONS: readonly FieldActionId[] = ['field-add', 'field-cancel']

// An entry is edited, removed and moved; the add and JSON rows only open.
function listRowActions(row: ListRowKind): ListActionId[] {
  switch (row) {
    case 'item':
      return ['list-move', 'list-edit', 'list-add', 'list-remove', 'list-reorder', 'list-back']
    case 'add':
    case 'json':
      return ['list-move', 'list-open', 'list-add', 'list-back']
  }
}

export type ListPaneActionId = ListActionId | ConfirmActionId | FieldActionId

function listActions(row: ListRowKind, step: ListStepKind): readonly ListPaneActionId[] {
  switch (step) {
    case 'browsing':
      return listRowActions(row)
    case 'confirming':
      return CONFIRM_ACTIONS
    case 'editing':
      return APPLY_ACTIONS
    case 'adding':
      return ADD_ACTIONS
  }
}

export type RulePaneActionId = RuleActionId | FieldActionId

// A text row is edited inline and a switch toggles in place; ctrl+r only where there is an
// override to clear.
function ruleActions(
  row: RuleRowControl | undefined,
  step: 'browsing' | 'editing'
): readonly RulePaneActionId[] {
  if (step === 'editing') return APPLY_ACTIONS

  const actions: RuleActionId[] = ['rule-move']

  if (row) actions.push(row.control === 'toggle' ? 'rule-toggle' : 'rule-edit')

  if (row?.reset === 'available') actions.push('rule-reset')

  return [...actions, 'rule-back']
}

const JSON_ACTIONS: readonly JsonActionId[] = ['json-save', 'json-newline', 'json-back']

// The on/off row switches; a glyph row edits, and offers clear once a glyph is set.
function iconsActions(view: IconsFormView): IconsActionId[] {
  if (view.mode === 'editing') return ['icons-apply', 'icons-cancel']

  const row: IconsActionId[] = []

  switch (view.entry?.control) {
    case 'toggle':
      row.push('icons-toggle')
      break
    case 'open':
      row.push('icons-edit')
      break
    case 'cycle':
    case 'step':
    case undefined:
      break
  }

  if (view.entry?.reset === 'available') row.push('icons-clear')

  return ['icons-move', ...row, 'icons-back']
}

export function getDialogActions(view: DialogView): readonly DialogActionId[] {
  switch (view.kind) {
    case 'settings':
      return settingsActions(view.entry, view.query)
    case 'setting-options':
      return OPTION_ACTIONS
    case 'setting-editor':
      return EDITOR_ACTIONS
    case 'setting-list':
      return listActions(view.row, view.step)
    case 'setting-rule':
      return ruleActions(view.row, view.step)
    case 'setting-json':
      return JSON_ACTIONS
    case 'icons-form':
      return iconsActions(view)
  }
}

export function getDialogActionKeys(id: DialogActionId): readonly DialogKey[] {
  return DIALOG_ACTIONS[id].keys
}

export function getDialogHints(view: DialogView): DialogHint[] {
  return getDialogActions(view).flatMap(id => {
    const action: DialogAction = DIALOG_ACTIONS[id]

    return action.footer
      ? [{ label: action.label, key: action.hint ?? action.keys.map(key => key.label).join('/') }]
      : []
  })
}

export interface DialogKeyInput {
  name?: string
  ctrl?: boolean
  shift?: boolean
}

function keyMatches(key: DialogKey, input: DialogKeyInput, keybindMode: KeybindMode): boolean {
  return (
    key.name === input.name &&
    key.ctrl === Boolean(input.ctrl) &&
    key.shift === Boolean(input.shift) &&
    (key.modes === 'any' || keybindMode === 'vim')
  )
}

// The offered action this key runs, or 'none'. Keys for vim only are offered only in vim mode.
function firstMatch<Id extends DialogActionId>(
  ids: readonly Id[],
  input: DialogKeyInput,
  keybindMode: KeybindMode = 'standard'
): Id | 'none' {
  const matched = ids.find(id =>
    getDialogActionKeys(id).some(key => keyMatches(key, input, keybindMode))
  )

  return matched ?? 'none'
}

export function matchSettingsAction(
  entry: Pick<SettingsEntry, 'control' | 'reset'> | undefined,
  query: string,
  input: DialogKeyInput
): SettingsActionId | 'none' {
  return firstMatch(settingsActions(entry, query), input)
}

export function matchOptionAction(input: DialogKeyInput): OptionActionId | 'none' {
  return firstMatch(OPTION_ACTIONS, input)
}

export function matchEditorAction(input: DialogKeyInput): EditorActionId | 'none' {
  return firstMatch(EDITOR_ACTIONS, input)
}

export function matchListAction(
  view: Extract<DialogView, { kind: 'setting-list' }>,
  input: DialogKeyInput
): ListPaneActionId | 'none' {
  return firstMatch(listActions(view.row, view.step), input, view.keybindMode)
}

export function matchRuleAction(
  view: Extract<DialogView, { kind: 'setting-rule' }>,
  input: DialogKeyInput
): RulePaneActionId | 'none' {
  return firstMatch(ruleActions(view.row, view.step), input)
}

export function matchJsonAction(input: DialogKeyInput): JsonActionId | 'none' {
  return firstMatch(JSON_ACTIONS, input)
}

export function matchIconsAction(
  view: IconsFormView,
  input: DialogKeyInput
): IconsActionId | 'none' {
  return firstMatch(iconsActions(view), input)
}
