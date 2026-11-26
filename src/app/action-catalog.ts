import { isHerdrAgentItem, isLiveSessionItem, type LiveSessionItem } from '../multiplexer/items'
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
]

const DIRECT_COMMANDS: ReadonlySet<CommandId> = new Set<CommandId>([
  'back',
  'search',
  'new-session',
  'open-agents',
  'kill-session',
  'toggle-pin-session',
  'open-settings',
  'open-themes',
])

const KEYWORDS: Partial<Record<CommandId, string>> = {
  'open-themes': 'theme color scheme appearance',
  'toggle-details': 'inspect preview panes windows tabs',
}

const FOOTER_LABELS: Partial<Record<ActionId, string>> = {
  back: 'back',
  search: 'search',
  'new-session': 'new',
  'open-agents': 'agents',
  'kill-session': 'kill',
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
      return liveSessionAvailability(target, 'Close')
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
      return 'Kill session'
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

function footerPart(context: ActionContext, id: ActionId, label: string): string[] {
  const keybind = getActionKeyHint(context, id)

  return keybind && getActionAvailability(context, id).kind === 'available'
    ? [`${keybind} ${label}`]
    : []
}

function footerAction(context: ActionContext, id: ActionId): string[] {
  return footerPart(context, id, FOOTER_LABELS[id] ?? id)
}

// What Enter on the New screen does for its current frozen launch plan, or 'apply' for an edit.
export type NewSessionAction = 'focus' | 'create' | 'clone' | 'apply' | 'none'

function newSessionFooter(
  context: ActionContext,
  action: NewSessionAction,
  steps: readonly NewSessionStepId[]
): string {
  const enter = action === 'none' ? [] : [`${getActionKeyHint(context, 'select')} ${action}`]

  return [...enter, ...steps.flatMap(id => footerAction(context, id)), 'esc cancel'].join('  ')
}

export function getActionFooter(
  context: ActionContext,
  newSession: NewSessionAction = 'none',
  newSessionSteps: readonly NewSessionStepId[] = []
): string {
  const prefixLabel = context.prefixKey ? `${context.prefixKey} ...` : 'direct keys'

  switch (context.appMode) {
    case AppMode.AgentsManage:
      return [
        ...footerAction(context, 'back'),
        ...footerPart(context, 'select', 'focus'),
        ...footerAction(context, 'kill-session'),
        ...footerAction(context, 'open-commands'),
        prefixLabel,
      ].join('  ')
    case AppMode.NewSession:
      return newSessionFooter(context, newSession, newSessionSteps)
    case AppMode.Search:
      return [
        ...footerPart(context, 'select', 'select'),
        ...footerAction(context, 'open-commands'),
        'esc cancel',
      ].join('  ')
    case AppMode.Normal:
      return [
        ...footerPart(context, 'select', 'select'),
        ...footerAction(context, 'search'),
        ...footerAction(context, 'new-session'),
        ...footerAction(context, 'open-agents'),
        ...footerAction(context, 'kill-session'),
        ...footerAction(context, 'open-commands'),
        prefixLabel,
      ].join('  ')
  }
}
