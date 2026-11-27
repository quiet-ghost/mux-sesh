import { describe, expect, test } from 'bun:test'
import {
  describeUnavailableAction,
  getActionKeys,
  getActionTarget,
  getCommandEntry,
  type ActionContext,
  type ActionId,
} from '../src/app/action-catalog'
import type { NewSessionStepControls } from '../src/app/new-session-step'
import {
  handleAgentsManageMode,
  handleNewSessionMode,
  handleNormalMode,
  handleSearchMode,
  type KeyboardHandlerContext,
  type KeyboardInput,
} from '../src/handlers/keyboard'
import { AppMode, ViewMode, type Item, type KeybindMode } from '../src/types'
import { ACTION_IDS, COMMAND_IDS } from './fixtures/action-ids'

const PREFIX = 'ctrl+x'

// Standard mode never enters Normal: it starts in, and returns to, Search.
const REACHABLE: readonly (readonly [KeybindMode, AppMode])[] = [
  ['vim', AppMode.Normal],
  ['vim', AppMode.Search],
  ['vim', AppMode.NewSession],
  ['vim', AppMode.AgentsManage],
  ['standard', AppMode.Search],
  ['standard', AppMode.NewSession],
  ['standard', AppMode.AgentsManage],
]

const session: Item = {
  title: 'alpha',
  desc: '',
  path: '/fixture/alpha',
  isSession: true,
  itemKind: 'tmux',
  backend: 'tmux',
  sessionId: 'alpha',
}

const agent: Item = { ...session, title: 'opencode-alpha', sessionId: 'opencode-alpha' }

interface Press {
  readonly label: string
  readonly input: KeyboardInput
  // The same key with its ctrl or shift dropped; a key that acts like it is not a binding of its own.
  readonly plain?: Press
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

const PLAIN: readonly Press[] = [
  ...LETTERS.map(name => ({ label: name, input: { name } })),
  ...[',', ';', '.', '/', 'space', 'tab'].map(name => ({ label: name, input: { name } })),
  { label: 'enter', input: { name: 'return' } },
  { label: 'esc', input: { name: 'escape' } },
  { label: 'up', input: { name: 'up' } },
  { label: 'down', input: { name: 'down' } },
]

const PRESSES: readonly Press[] = [
  ...PLAIN,
  ...LETTERS.flatMap(name => {
    const plain = { label: name, input: { name } }

    return [
      { label: `ctrl+${name}`, input: { name, ctrl: true }, plain },
      { label: `shift+${name}`, input: { name, shift: true }, plain },
    ]
  }),
]

// Keys that are not catalog actions: quitting (q with any modifier, esc, ctrl+q), the 1–9 quick
// select (never pressed here), and esc cancelling Search or New (the footer's `cancel esc`).
// Quit keys would end the test process.
function isOutsideCatalog(keybindMode: KeybindMode, mode: AppMode, press: Press): boolean {
  const name = press.input.name

  if (mode === AppMode.Normal) return name === 'q' || name === 'escape'

  if (mode === AppMode.Search) {
    return name === 'escape' || (keybindMode === 'standard' && press.label === 'ctrl+q')
  }

  return mode === AppMode.NewSession && name === 'escape'
}

function actionContextFor(keybindMode: KeybindMode, mode: AppMode): ActionContext {
  return {
    appMode: mode,
    viewMode: ViewMode.Sessions,
    keybindMode,
    prefixKey: PREFIX,
    backend: { kind: 'tmux', capabilities: { previousWorkspace: true } },
    agentCount: 1,
    target: getActionTarget(mode === AppMode.AgentsManage ? agent : session),
    marked: new Map(),
  }
}

function refusedAction(actionContext: ActionContext, message: string): ActionId | undefined {
  return COMMAND_IDS.find(
    id => describeUnavailableAction(getCommandEntry(actionContext, id)) === message
  )
}

interface Outcome {
  readonly actions: ReadonlySet<ActionId>
  // False when the handler ignored a waiting prefix and handled the key as if unprefixed.
  readonly consumedPrefix: boolean
  readonly activatedPrefix: boolean
}

function press(
  keybindMode: KeybindMode,
  mode: AppMode,
  input: KeyboardInput,
  prefixActive: boolean
): Outcome {
  const actions = new Set<ActionId>()
  const actionContext = actionContextFor(keybindMode, mode)
  let consumedPrefix = false
  let activatedPrefix = false

  const record = (id: ActionId) => () => {
    actions.add(id)
  }

  const recordAsync = (id: ActionId) => async () => {
    actions.add(id)
  }

  const ctx: KeyboardHandlerContext = {
    runAction: task => {
      task().catch(cause => {
        throw cause
      })
    },
    appMode: mode,
    viewMode: ViewMode.Sessions,
    items: [session],
    regularSessions: [session],
    agentSessions: [agent],
    cursor: 0,
    agentCursor: 0,
    searchQuery: '',
    actionContext,
    prefixKey: PREFIX,
    projectItems: [],
    sessionItems: [session],
    prefixActive,
    prefixTimeoutRef: { current: null },
    setAppMode: next => {
      if (mode === AppMode.AgentsManage) actions.add('back')
      else if (next === AppMode.Search) actions.add('search')
      else if (next === AppMode.NewSession) actions.add('new-session')
      else if (next === AppMode.AgentsManage) actions.add('open-agents')
    },
    setViewMode: () => {},
    setCursor: () => {},
    setAgentCursor: () => {},
    setSearchQuery: () => {},
    setAllItems: () => {},
    setItems: () => {},
    setPrefixActive: active => {
      if (active) activatedPrefix = true
      else consumedPrefix = true
    },
    refreshItems: async view => {
      if (view === ViewMode.Sessions) actions.add('view-sessions')
      else if (view === ViewMode.Projects) actions.add('view-projects')
    },
    refreshList: recordAsync('refresh'),
    requestKillSession: record('kill-session'),
    requestMarkedClose: recordAsync('kill-session'),
    toggleMark: record('mark-target'),
    togglePinnedSession: recordAsync('toggle-pin-session'),
    handleSelect: recordAsync('select'),
    launchPlanned: recordAsync('select'),
    handleLastSession: recordAsync('last-session'),
    handleRootSession: recordAsync('root-session'),
    handleEditTarget: recordAsync('edit-target'),
    openRenameModal: record('rename-session'),
    openCommandsModal: record('open-commands'),
    toggleDetails: record('toggle-details'),
    openSettingsModal: record('open-settings'),
    showToast: toast => {
      const refused = refusedAction(actionContext, toast.message)

      if (refused) actions.add(refused)
      else throw new Error(`Unexpected toast for a key press: ${toast.message}`)
    },
  }

  const steps: NewSessionStepControls = {
    step: 'browse',
    keys: ['new-session-name', 'new-session-startup', 'new-session-here', 'new-session-file'],
    open: id => {
      actions.add(id)
    },
    back: () => {},
    move: () => {},
    submit: recordAsync('select'),
  }

  switch (mode) {
    case AppMode.Normal:
      handleNormalMode(input, ctx, keybindMode)
      break
    case AppMode.Search:
      handleSearchMode(input, ctx, keybindMode)
      break
    case AppMode.NewSession:
      handleNewSessionMode(input, ctx, keybindMode, steps)
      break
    case AppMode.AgentsManage:
      handleAgentsManageMode(input, ctx, keybindMode)
      break
  }

  if (actions.size > 1) throw new Error(`One key ran several actions: ${[...actions].join(', ')}`)

  return { actions, consumedPrefix, activatedPrefix }
}

function actionOf(outcome: Outcome): ActionId | undefined {
  return [...outcome.actions][0]
}

// Every `key => action` pair the real handler runs, as the catalog would write the key.
function handlerBindings(keybindMode: KeybindMode, mode: AppMode): string[] {
  const bindings = [false, true].flatMap(prefixActive =>
    PRESSES.flatMap(key => {
      if (isOutsideCatalog(keybindMode, mode, key)) return []

      const outcome = press(keybindMode, mode, key.input, prefixActive)
      const action = actionOf(outcome)

      if (!action) return []

      // A waiting prefix the handler ignored: the unprefixed pass lists this key.
      if (prefixActive && !outcome.consumedPrefix) return []

      if (
        key.plain &&
        actionOf(press(keybindMode, mode, key.plain.input, prefixActive)) === action
      ) {
        return []
      }

      return [`${prefixActive ? `${PREFIX} ` : ''}${key.label} => ${action}`]
    })
  )

  return [...new Set(bindings)].sort()
}

function catalogBindings(keybindMode: KeybindMode, mode: AppMode): string[] {
  const context = actionContextFor(keybindMode, mode)

  const bindings = ACTION_IDS.flatMap(id =>
    getActionKeys(context, id).map(key => `${key} => ${id}`)
  )

  return [...new Set(bindings)].sort()
}

describe('the action catalog lists exactly the keys the handlers run', () => {
  test.each(
    REACHABLE.map(
      ([keybindMode, mode]) => [`${keybindMode} ${AppMode[mode]}`, keybindMode, mode] as const
    )
  )('%s', (_name, keybindMode, mode) => {
    expect(handlerBindings(keybindMode, mode)).toEqual(catalogBindings(keybindMode, mode))
  })

  test.each(
    REACHABLE.map(
      ([keybindMode, mode]) => [`${keybindMode} ${AppMode[mode]}`, keybindMode, mode] as const
    )
  )(
    '%s: the prefix key waits for a second key wherever the catalog offers prefixed keys',
    (_name, keybindMode, mode) => {
      const prefixed = catalogBindings(keybindMode, mode).some(binding =>
        binding.startsWith(`${PREFIX} `)
      )

      expect(press(keybindMode, mode, { name: 'x', ctrl: true }, false).activatedPrefix).toBe(
        prefixed
      )
    }
  )
})
