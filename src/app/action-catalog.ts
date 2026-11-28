import {
  getItemKey,
  isHerdrAgentItem,
  isLiveSessionItem,
  type LiveSessionItem,
} from '../multiplexer/items'
import type { MultiplexerBackend } from '../multiplexer/types'
import { AppMode, ViewMode, type Item, type KeybindMode } from '../types'
import type { PendingClose } from './pending-close'

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

export function getActionScope(id: ActionId): ActionScope {
  return TARGET_ACTIONS.has(id) ? 'target' : 'global'
}

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
    scope: getActionScope(id),
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
