import {
  getItemKey,
  isHerdrAgentItem,
  isLiveSessionItem,
  type LiveSessionItem,
} from '../multiplexer/items'
import type { MultiplexerBackend } from '../multiplexer/types'
import { AppMode, ViewMode, type Item, type KeybindMode } from '../types'

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
  prefixKey: string | undefined
  // Null until the multiplexer backend has been resolved.
  backend: ActionBackend | null
  agentCount: number
  target: ActionTarget
  // Rows marked for a batch close; when any are marked, close reviews them instead of the cursor.
  marked: ReadonlyMap<string, Item>
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

type KeyHint = (context: ActionContext) => string

function prefixed(context: ActionContext, suffix: string): string {
  return `${context.prefixKey ?? 'ctrl+x'} ${suffix}`
}

function vimOnly(key: string): KeyHint {
  return context => (context.keybindMode === 'vim' ? key : '')
}

// A direct vim key that also has a prefix binding once a prefix key is configured.
function vimOrPrefix(key: string): KeyHint {
  return context => {
    if (context.keybindMode === 'vim') return key

    return context.prefixKey ? prefixed(context, key) : ''
  }
}

// Prefix commands take a direct vim key only when no prefix key is configured.
function prefixOrVim(suffix: string, vimKey = suffix): KeyHint {
  return context => {
    if (context.prefixKey) return prefixed(context, suffix)

    return context.keybindMode === 'vim' ? vimKey : ''
  }
}

function fixed(key: string): KeyHint {
  return () => key
}

function standardPrefix(suffix: string): KeyHint {
  return context => (context.keybindMode === 'standard' ? prefixed(context, suffix) : '')
}

function standardOnly(key: string): KeyHint {
  return context => (context.keybindMode === 'standard' ? key : '')
}

const KEY_HINTS: Record<AppMode, Partial<Record<ActionId, KeyHint>>> = {
  [AppMode.AgentsManage]: {
    back: fixed('esc'),
    select: fixed('enter'),
    'kill-session': vimOrPrefix('d'),
    'mark-target': vimOrPrefix('m'),
    'rename-session': prefixOrVim('r'),
    'open-settings': context => (context.keybindMode === 'vim' && !context.prefixKey ? ',' : ''),
    'toggle-details': vimOrPrefix('v'),
  },
  [AppMode.Normal]: {
    select: fixed('enter'),
    search: vimOnly('i'),
    'new-session': vimOnly('n'),
    'open-agents': vimOnly('o'),
    'kill-session': vimOrPrefix('d'),
    'mark-target': vimOrPrefix('m'),
    'toggle-pin-session': fixed('ctrl+f'),
    'view-projects': prefixOrVim('p'),
    'view-sessions': prefixOrVim('s'),
    'rename-session': prefixOrVim('r'),
    'last-session': prefixOrVim('l'),
    'root-session': prefixOrVim('g'),
    'edit-target': prefixOrVim('e'),
    refresh: prefixOrVim('shift+r', 'R'),
    'toggle-details': vimOrPrefix('v'),
  },
  [AppMode.Search]: {
    select: fixed('enter'),
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

export function getActionKeyHint(context: ActionContext, id: ActionId): string {
  if (id === 'open-commands') return 'ctrl+p'

  return KEY_HINTS[context.appMode][id]?.(context) ?? ''
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
    keybind: getActionKeyHint(context, id),
    scope: TARGET_ACTIONS.has(id) ? 'target' : 'global',
    availability: getActionAvailability(context, id),
  }
}

export function getCommandEntries(context: ActionContext): CommandEntry[] {
  const prefixCategory = context.prefixKey ? `Prefix ${context.prefixKey}` : 'Prefix'
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

// `prefix` is the prefix-key indicator; `cancel` is esc leaving Search or New.
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
  return context.prefixKey
    ? { id: 'prefix', label: 'prefix', key: context.prefixKey }
    : { id: 'prefix', label: 'direct keys', key: '' }
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

function footerHints(
  context: ActionContext,
  enter: NewSessionAction,
  newSessionSteps: readonly NewSessionStepId[]
): FooterHint[] {
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
