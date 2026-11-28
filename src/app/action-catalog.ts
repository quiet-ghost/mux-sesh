import {
  getItemKey,
  isHerdrAgentItem,
  isLiveSessionItem,
  type LiveSessionItem,
} from '../multiplexer/items'
import type { MultiplexerBackend } from '../multiplexer/types'
import type { SettingsEntry } from '../settings'
import { AppMode, ViewMode, type Item, type KeybindMode } from '../types'
import { CONFIRM_CLOSE_KEY, type PendingClose } from './pending-close'

export type CommandId =
  | 'search'
  | 'new-session'
  | 'open-settings'
  | 'open-themes'
  | 'view-projects'
  | 'view-sessions'
  | 'rename-session'
  | 'kill-session'
  | 'mark-target'
  | 'toggle-pin-session'
  | 'last-session'
  | 'root-session'
  | 'edit-target'
  | 'open-agents'
  | 'refresh'
  | 'toggle-details'
  | 'back'

// Secondary steps of the New screen; which ones are offered depends on the step and selection.
export type NewSessionStepId =
  'new-session-name' | 'new-session-startup' | 'new-session-here' | 'new-session-file'

// Footer-only actions: they are keys, not palette commands.
export type ActionId = CommandId | 'select' | 'open-commands' | NewSessionStepId

export type ActionTarget =
  | { kind: 'none' }
  | { kind: 'session'; item: LiveSessionItem }
  | { kind: 'agent'; item: LiveSessionItem }
  | { kind: 'project'; item: Item }
  | { kind: 'file'; item: Item }
  | { kind: 'configured'; item: Item }

export type ActionAvailability = { kind: 'available' } | { kind: 'unavailable'; reason: string }

export type ActionScope = 'global' | 'target'

export type ActionBackend = Pick<MultiplexerBackend, 'kind' | 'capabilities'>

export interface ActionContext {
  appMode: AppMode
  viewMode: ViewMode
  keybindMode: KeybindMode
  // Always a key: an empty or missing `prefix_key` resolves to ctrl+x.
  prefixKey: string
  // Null until the multiplexer backend has been resolved.
  backend: ActionBackend | null
  agentCount: number
  target: ActionTarget
  // Rows marked for a batch close; when any are marked, close reviews them instead of the cursor.
  marked: ReadonlyMap<string, Item>
  // A single close waiting for its second key; the footer then offers only confirm and cancel.
  pendingClose: PendingClose
}

export interface ActionEntry<Id extends ActionId = ActionId> {
  id: Id
  category: string
  title: string
  keybind: string
  scope: ActionScope
  availability: ActionAvailability
  keywords?: string
}

export type CommandEntry = ActionEntry<CommandId>

const AVAILABLE: ActionAvailability = { kind: 'available' }

const TARGET_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
  'select',
  'rename-session',
  'kill-session',
  'mark-target',
  'toggle-pin-session',
  'root-session',
  'edit-target',
])

const AGENT_PALETTE: readonly CommandId[] = [
  'back',
  'kill-session',
  'open-settings',
  'open-themes',
  'rename-session',
  'toggle-details',
  'mark-target',
]

const SESSION_PALETTE: readonly CommandId[] = [
  'search',
  'new-session',
  'open-agents',
  'kill-session',
  'toggle-pin-session',
  'open-settings',
  'open-themes',
  'view-projects',
  'view-sessions',
  'rename-session',
  'last-session',
  'root-session',
  'refresh',
  'edit-target',
  'toggle-details',
  'mark-target',
]

const DIRECT_COMMANDS: ReadonlySet<CommandId> = new Set<CommandId>([
  'back',
  'search',
  'new-session',
  'open-agents',
  'kill-session',
  'mark-target',
  'toggle-pin-session',
  'open-settings',
  'open-themes',
])

const KEYWORDS: Partial<Record<CommandId, string>> = {
  'kill-session': 'kill',
  'mark-target': 'select batch multiple close',
  'open-themes': 'theme color scheme appearance',
  'toggle-details': 'inspect preview panes windows tabs',
}

const FOOTER_LABELS: Partial<Record<ActionId, string>> = {
  back: 'back',
  search: 'search',
  'new-session': 'new',
  'open-agents': 'agents',
  'kill-session': 'close',
  'mark-target': 'mark',
  'open-commands': 'commands',
  'new-session-name': 'name',
  'new-session-startup': 'startup',
  'new-session-here': 'here',
  'new-session-file': 'file',
}

export function getActionTarget(item: Item | undefined): ActionTarget {
  if (!item) return { kind: 'none' }

  if (isHerdrAgentItem(item)) return { kind: 'agent', item }

  if (isLiveSessionItem(item)) return { kind: 'session', item }

  if (item.itemKind === 'configured') return { kind: 'configured', item }

  return item.itemKind === 'file' ? { kind: 'file', item } : { kind: 'project', item }
}

export function getActionTargetItem(target: ActionTarget): Item | undefined {
  return target.kind === 'none' ? undefined : target.item
}

function unavailable(reason: string): ActionAvailability {
  return { kind: 'unavailable', reason }
}

function liveSessionAvailability(target: ActionTarget, verb: 'Rename' | 'Close') {
  switch (target.kind) {
    case 'session':
      return AVAILABLE
    case 'agent':
      return unavailable(`${verb} it in Herdr`)
    case 'none':
      return unavailable('Select a session first')
    case 'project':
    case 'file':
    case 'configured':
      return unavailable('Select a live session')
  }
}

function closeAvailability(context: ActionContext): ActionAvailability {
  return context.marked.size > 0 ? AVAILABLE : liveSessionAvailability(context.target, 'Close')
}

function markAvailability(target: ActionTarget): ActionAvailability {
  switch (target.kind) {
    case 'none':
      return unavailable('Select a session first')
    case 'file':
      return unavailable('Files cannot be closed')
    case 'session':
    case 'agent':
    case 'project':
    case 'configured':
      return AVAILABLE
  }
}

function pinAvailability(context: ActionContext): ActionAvailability {
  if (context.viewMode !== ViewMode.Sessions) return unavailable('Switch to sessions first')

  switch (context.target.kind) {
    case 'session':
    case 'configured':
      return AVAILABLE
    case 'agent':
      return unavailable('Agent targets cannot be pinned')
    case 'none':
      return unavailable('Select a session first')
    case 'project':
    case 'file':
      return unavailable('Only sessions can be pinned')
  }
}

function previousSessionAvailability(backend: ActionBackend | null): ActionAvailability {
  if (!backend) return unavailable('The backend is still loading')

  if (backend.capabilities.previousWorkspace) return AVAILABLE

  return unavailable(
    backend.kind === 'herdr'
      ? 'Herdr does not track the previous workspace'
      : 'The backend does not track the previous session'
  )
}

function agentsAvailability(context: ActionContext): ActionAvailability {
  if (context.viewMode !== ViewMode.Sessions) return unavailable('Switch to sessions first')

  return context.agentCount > 0 ? AVAILABLE : unavailable('No agent sessions')
}

export function getActionAvailability(context: ActionContext, id: ActionId): ActionAvailability {
  const { target } = context

  switch (id) {
    case 'select':
      return target.kind === 'none' ? unavailable('Nothing is selected') : AVAILABLE
    case 'rename-session':
      return liveSessionAvailability(target, 'Rename')
    case 'kill-session':
      return closeAvailability(context)
    case 'mark-target':
      return markAvailability(target)
    case 'toggle-pin-session':
      return pinAvailability(context)
    case 'root-session':
      return target.kind === 'none' ? unavailable('Select a session or project first') : AVAILABLE
    case 'edit-target':
      return target.kind === 'configured'
        ? AVAILABLE
        : unavailable('Only configured projects have one')
    case 'last-session':
      return previousSessionAvailability(context.backend)
    case 'open-agents':
      return agentsAvailability(context)
    case 'search':
    case 'new-session':
    case 'open-commands':
    case 'open-settings':
    case 'open-themes':
    case 'view-projects':
    case 'view-sessions':
    case 'refresh':
    case 'toggle-details':
    case 'back':
      return AVAILABLE
    // Offered only through the New footer's step list, which the New key handler also reads.
    case 'new-session-name':
    case 'new-session-startup':
    case 'new-session-here':
    case 'new-session-file':
      return AVAILABLE
  }
}

// Every key that runs the action, the one the footer shows first.
type KeyHint = (context: ActionContext) => readonly string[]

const NO_KEYS: readonly string[] = []

function prefixed(context: ActionContext, suffix: string): string {
  return `${context.prefixKey} ${suffix}`
}

function fixed(...keys: readonly string[]): KeyHint {
  return () => keys
}

function prefix(suffix: string): KeyHint {
  return context => [prefixed(context, suffix)]
}

function vimOnly(key: string): KeyHint {
  return context => (context.keybindMode === 'vim' ? [key] : NO_KEYS)
}

// A direct vim key that the prefix also reaches, in both keybinding modes.
function vimAndPrefix(key: string): KeyHint {
  return context =>
    context.keybindMode === 'vim' ? [key, prefixed(context, key)] : [prefixed(context, key)]
}

function standardPrefix(suffix: string): KeyHint {
  return context => (context.keybindMode === 'standard' ? [prefixed(context, suffix)] : NO_KEYS)
}

function standardOnly(key: string): KeyHint {
  return context => (context.keybindMode === 'standard' ? [key] : NO_KEYS)
}

const KEY_HINTS: Record<AppMode, Partial<Record<ActionId, KeyHint>>> = {
  [AppMode.AgentsManage]: {
    back: context => ['esc', prefixed(context, 'o')],
    select: fixed('enter'),
    'kill-session': vimAndPrefix('d'),
    'mark-target': vimAndPrefix('m'),
    'rename-session': prefix('r'),
    'toggle-details': vimAndPrefix('v'),
    'open-commands': fixed('ctrl+p'),
  },
  [AppMode.Normal]: {
    select: fixed('enter'),
    search: vimOnly('i'),
    'new-session': vimOnly('n'),
    'open-agents': vimOnly('o'),
    'kill-session': vimAndPrefix('d'),
    'mark-target': vimAndPrefix('m'),
    'toggle-pin-session': fixed('ctrl+f'),
    'view-projects': vimAndPrefix('p'),
    'view-sessions': vimAndPrefix('s'),
    'rename-session': prefix('r'),
    'last-session': prefix('l'),
    'root-session': prefix('g'),
    'edit-target': prefix('e'),
    refresh: prefix('shift+r'),
    'toggle-details': vimAndPrefix('v'),
    'open-commands': fixed('ctrl+p'),
  },
  [AppMode.Search]: {
    select: fixed('enter'),
    'open-commands': fixed('ctrl+p'),
    'kill-session': standardPrefix('d'),
    'mark-target': standardPrefix('m'),
    'new-session': standardPrefix('n'),
    'open-agents': standardPrefix('o'),
    'open-settings': standardPrefix('s'),
    'last-session': standardPrefix('l'),
    'root-session': standardPrefix('g'),
    'rename-session': standardPrefix('r'),
    refresh: standardPrefix('shift+r'),
    'toggle-details': standardPrefix('v'),
  },
  [AppMode.NewSession]: {
    select: fixed('enter'),
    search: standardOnly('ctrl+i'),
    'kill-session': standardOnly('ctrl+d'),
    'new-session-name': fixed('ctrl+n'),
    'new-session-startup': fixed('ctrl+t'),
    'new-session-here': fixed('ctrl+g'),
    'new-session-file': fixed('ctrl+o'),
  },
}

export function getActionKeys(context: ActionContext, id: ActionId): readonly string[] {
  return KEY_HINTS[context.appMode][id]?.(context) ?? NO_KEYS
}

// The key the footer shows; empty when the action has no key in this mode.
export function getActionKeyHint(context: ActionContext, id: ActionId): string {
  return getActionKeys(context, id)[0] ?? ''
}

function getActionTitle(context: ActionContext, id: CommandId): string {
  const agents = context.appMode === AppMode.AgentsManage

  switch (id) {
    case 'back':
      return 'Back'
    case 'search':
      return 'Search'
    case 'new-session':
      return 'New session'
    case 'open-agents':
      return 'Open agent sessions'
    case 'kill-session':
      return context.marked.size > 0 ? `Close ${context.marked.size} marked` : 'Close session'
    case 'mark-target': {
      const item = getActionTargetItem(context.target)

      return item && context.marked.has(getItemKey(item))
        ? 'Unmark for closing'
        : 'Mark for closing'
    }

    case 'toggle-pin-session':
      return getActionTargetItem(context.target)?.isPinned ? 'Unpin session' : 'Pin session'
    case 'open-settings':
      return agents ? 'Settings' : 'Open settings'
    case 'open-themes':
      return 'Themes'
    case 'view-projects':
      return 'Show projects'
    case 'view-sessions':
      return 'Show sessions'
    case 'rename-session':
      return 'Rename session'
    case 'last-session':
      return 'Last session'
    case 'root-session':
      return 'Root session'
    case 'edit-target':
      return 'Edit target'
    case 'refresh':
      return 'Refresh'
    case 'toggle-details':
      return 'Toggle details'
  }
}

function getActionEntry<Id extends ActionId>(
  context: ActionContext,
  id: Id,
  title: string,
  category: string
): ActionEntry<Id> {
  return {
    id,
    category,
    title,
    keybind: getActionKeys(context, id).join(' / '),
    scope: TARGET_ACTIONS.has(id) ? 'target' : 'global',
    availability: getActionAvailability(context, id),
  }
}

export function getCommandEntries(context: ActionContext): CommandEntry[] {
  const prefixCategory = `Prefix ${context.prefixKey}`
  const ids = context.appMode === AppMode.AgentsManage ? AGENT_PALETTE : SESSION_PALETTE

  return ids.map(id => {
    const category = DIRECT_COMMANDS.has(id) ? 'Direct' : prefixCategory
    const entry = getActionEntry(context, id, getActionTitle(context, id), category)
    const keywords = KEYWORDS[id]

    return keywords ? { ...entry, keywords } : entry
  })
}

export function getCommandEntry(context: ActionContext, id: CommandId): CommandEntry {
  return getActionEntry(context, id, getActionTitle(context, id), '')
}

export function describeUnavailableAction(entry: ActionEntry): string | undefined {
  return entry.availability.kind === 'unavailable'
    ? `${entry.title} unavailable: ${entry.availability.reason}`
    : undefined
}

// `prefix` is the prefix-key indicator; `cancel` is esc leaving Search or New, or a waiting close.
export type FooterHintId = ActionId | 'prefix' | 'cancel'

// Shown as `label key`; an empty key shows the label alone.
export interface FooterHint {
  readonly id: FooterHintId
  readonly label: string
  readonly key: string
}

// Grouped by catalog scope: screen-wide actions, and actions on the selected row.
export interface ActionFooter {
  readonly global: readonly FooterHint[]
  readonly target: readonly FooterHint[]
}

const CANCEL_HINT: FooterHint = { id: 'cancel', label: 'cancel', key: 'esc' }

function footerPart(context: ActionContext, id: ActionId, label: string): FooterHint[] {
  const key = getActionKeyHint(context, id)

  return key && getActionAvailability(context, id).kind === 'available' ? [{ id, label, key }] : []
}

function footerAction(context: ActionContext, id: ActionId): FooterHint[] {
  const label = FOOTER_LABELS[id] ?? id

  if (id === 'kill-session' && context.marked.size > 0) {
    return footerPart(context, id, `${label} ${context.marked.size} marked`)
  }

  return footerPart(context, id, label)
}

function prefixHint(context: ActionContext): FooterHint {
  return { id: 'prefix', label: 'prefix', key: context.prefixKey }
}

// What Enter does for the current frozen launch plan (New, or a Projects row), or 'apply' for an edit.
export type NewSessionAction = 'focus' | 'create' | 'clone' | 'apply' | 'none'

function newSessionHints(
  context: ActionContext,
  action: NewSessionAction,
  steps: readonly NewSessionStepId[]
): FooterHint[] {
  const enter: FooterHint[] =
    action === 'none'
      ? []
      : [{ id: 'select', label: action, key: getActionKeyHint(context, 'select') }]

  return [...enter, ...steps.flatMap(id => footerAction(context, id)), CANCEL_HINT]
}

// A Projects row opens through its frozen launch plan, so Enter names that plan's action; while
// it is still planning or refused, Enter is not advertised.
function selectHint(context: ActionContext, enter: NewSessionAction): FooterHint[] {
  if (context.viewMode !== ViewMode.Projects) return footerPart(context, 'select', 'select')

  return enter === 'none' || enter === 'apply' ? [] : footerPart(context, 'select', enter)
}

// While a close waits, the next key either confirms it or cancels it, in every mode.
const CONFIRM_CLOSE_HINTS: readonly FooterHint[] = [
  CANCEL_HINT,
  { id: 'kill-session', label: FOOTER_LABELS['kill-session'] ?? 'close', key: CONFIRM_CLOSE_KEY },
]

function footerHints(
  context: ActionContext,
  enter: NewSessionAction,
  newSessionSteps: readonly NewSessionStepId[]
): readonly FooterHint[] {
  if (context.pendingClose.kind === 'armed') return CONFIRM_CLOSE_HINTS

  switch (context.appMode) {
    case AppMode.AgentsManage:
      return [
        ...footerAction(context, 'back'),
        ...footerPart(context, 'select', 'focus'),
        ...footerAction(context, 'kill-session'),
        ...footerAction(context, 'open-commands'),
        prefixHint(context),
      ]
    case AppMode.NewSession:
      return newSessionHints(context, enter, newSessionSteps)
    case AppMode.Search:
      return [...selectHint(context, enter), ...footerAction(context, 'open-commands'), CANCEL_HINT]
    case AppMode.Normal:
      return [
        ...selectHint(context, enter),
        ...footerAction(context, 'search'),
        ...footerAction(context, 'new-session'),
        ...footerAction(context, 'open-agents'),
        ...footerAction(context, 'kill-session'),
        ...footerAction(context, 'open-commands'),
        prefixHint(context),
      ]
  }
}

function isTargetHint(hint: FooterHint): boolean {
  return hint.id !== 'prefix' && hint.id !== 'cancel' && TARGET_ACTIONS.has(hint.id)
}

// `enter` is what the current frozen launch plan does: New's plan, or the highlighted Projects row's.
export function getActionFooter(
  context: ActionContext,
  enter: NewSessionAction = 'none',
  newSessionSteps: readonly NewSessionStepId[] = []
): ActionFooter {
  const hints = footerHints(context, enter, newSessionSteps)

  return {
    global: hints.filter(hint => !isTargetHint(hint)),
    target: hints.filter(isTargetHint),
  }
}

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

export type DialogActionId =
  | SettingsActionId
  | OptionActionId
  | EditorActionId
  | ListActionId
  | ConfirmActionId
  | FieldActionId

// The selected row of a list pane: an entry, the add row, or the "Edit as JSON…" row.
export type ListRowKind = 'item' | 'add' | 'json'

// What a list pane is doing: browsing rows, confirming a removal, or typing into a field.
export type ListStepKind = 'browsing' | 'confirming' | 'editing' | 'adding'

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

export const DIALOG_ACTIONS = {
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
