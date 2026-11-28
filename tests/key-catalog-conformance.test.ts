import { describe, expect, test } from 'bun:test'
import {
  describeUnavailableAction,
  getActionKeys,
  getActionTarget,
  getCommandEntry,
  getDialogActionKeys,
  getDialogActions,
  type ActionContext,
  type ActionId,
  type DialogActionId,
  type DialogView,
} from '../src/app/action-catalog'
import { handleModalKeyboard } from '../src/app/modal-keyboard'
import type { ModalState } from '../src/app/modals'
import { OptionPicker } from '../src/app/option-picker'
import { PendingClose } from '../src/app/pending-close'
import type { NewSessionStepControls } from '../src/app/new-session-step'
import {
  handleAgentsManageMode,
  handleNewSessionMode,
  handleNormalMode,
  handleSearchMode,
  type KeyboardHandlerContext,
  type KeyboardInput,
} from '../src/handlers/keyboard'
import type { SettingsControl, SettingsEntry, SettingsReset } from '../src/settings'
import { AppMode, ViewMode, type Item, type KeybindMode } from '../src/types'
import {
  ACTION_IDS,
  COMMAND_IDS,
  DIALOG_ACTION_IDS,
  EVERY_DIALOG_ACTION_LISTED,
} from './fixtures/action-ids'

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
    pendingClose: PendingClose.none,
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
    launchProjectRow: recordAsync('select'),
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

// Settings dialogs: a focused text field takes letters, so only non-text keys are actions.
type DialogKeyboardContext = Parameters<typeof handleModalKeyboard>[1]

interface DialogPress {
  readonly label: string
  readonly input: { name: string; ctrl?: boolean }
}

const DIALOG_LETTER_PRESSES: readonly DialogPress[] = LETTERS.map(name => ({
  label: name,
  input: { name },
}))

// Every key a dialog could act on, written as the catalog writes it.
const DIALOG_PRESSES: readonly DialogPress[] = [
  ...DIALOG_LETTER_PRESSES,
  ...LETTERS.map(name => ({ label: `ctrl+${name}`, input: { name, ctrl: true } })),
  ...['space', 'tab', '/'].map(name => ({ label: name, input: { name } })),
  { label: '↑', input: { name: 'up' } },
  { label: '↓', input: { name: 'down' } },
  { label: '←', input: { name: 'left' } },
  { label: '→', input: { name: 'right' } },
  { label: 'enter', input: { name: 'return' } },
  { label: 'esc', input: { name: 'escape' } },
]

interface DialogCase {
  readonly name: string
  readonly view: DialogView
  readonly modalState: ModalState
  readonly entry: SettingsEntry | undefined
}

function settingsRow(control: SettingsControl, reset: SettingsReset): SettingsEntry {
  return {
    id: control === 'step' ? 'dirLength' : 'sortOrder',
    title: 'Fixture setting',
    category: 'Sessions',
    description: 'A setting for key checks',
    keywords: '',
    value: 'value',
    control,
    reset,
  }
}

const SETTINGS_CONTROLS: readonly SettingsControl[] = ['toggle', 'cycle', 'step', 'open']
const SETTINGS_RESETS: readonly SettingsReset[] = ['default', 'available', 'unavailable']

const DIALOG_CASES: readonly DialogCase[] = [
  ...SETTINGS_CONTROLS.flatMap(control =>
    SETTINGS_RESETS.flatMap(reset =>
      ['', 'sort'].map(query => {
        const row = settingsRow(control, reset)

        return {
          name: `Settings ${control} ${reset} ${query ? 'searching' : 'idle'}`,
          view: { kind: 'settings', entry: row, query },
          modalState: { type: 'settings', picker: OptionPicker.browsing },
          entry: row,
        } satisfies DialogCase
      })
    )
  ),
  {
    name: 'Settings with no match',
    view: { kind: 'settings', entry: undefined, query: 'zzz' },
    modalState: { type: 'settings', picker: OptionPicker.browsing },
    entry: undefined,
  },
  {
    name: 'setting picker',
    view: { kind: 'setting-options' },
    modalState: {
      type: 'setting-options',
      field: 'sortOrder',
      openedFrom: 'settings',
      picker: OptionPicker.browsing,
    },
    entry: undefined,
  },
  {
    name: 'setting editor',
    view: { kind: 'setting-editor' },
    modalState: { type: 'setting-editor', field: 'startupCommand' },
    entry: undefined,
  },
]

function notADialogAction(): never {
  throw new Error('A dialog key reached an action outside the settings dialogs')
}

// The actions one key press ran, and whether the dialog kept the key from the text field.
interface DialogOutcome {
  readonly actions: readonly DialogActionId[]
  readonly consumed: boolean
}

function pressDialog(dialog: DialogCase, input: DialogPress['input']): DialogOutcome {
  const actions: DialogActionId[] = []
  const query = dialog.view.kind === 'settings' ? dialog.view.query : ''
  const row = dialog.entry

  const record = (id: DialogActionId) => () => {
    actions.push(id)
  }

  const recordAsync = (id: DialogActionId) => async () => {
    actions.push(id)
  }

  const ctx: DialogKeyboardContext = {
    modalState: dialog.modalState,
    filteredCommandEntries: [],
    commandsCursor: 0,
    setCommandsCursor: notADialogAction,
    filteredSettingsEntries: row ? [row] : [],
    settingsCursor: 0,
    setSettingsCursor: record('settings-move'),
    settingsSearchQuery: query,
    setSettingsSearchQuery: record('settings-clear'),
    filteredSettingOptions: [{ value: 'live-first', label: 'live first' }],
    settingOptionsCursor: 0,
    setSettingOptionsCursor: record('option-move'),
    closeModal: record(dialog.view.kind === 'settings' ? 'settings-close' : 'option-back'),
    openSettingOptions: record('settings-open'),
    openSettingEditor: record('settings-open'),
    isOptionSetting: field => field === 'sortOrder',
    setModalState: record(dialog.view.kind === 'setting-editor' ? 'editor-back' : 'option-back'),
    setSettingEditorError: () => {},
    runAction: task => {
      task().catch(cause => {
        throw cause
      })
    },
    executeCommand: notADialogAction,
    showToast: notADialogAction,
    handleSettingOptionSubmit: recordAsync('option-apply'),
    handleSettingsEditorSubmit: recordAsync('editor-apply'),
    handleSettingStep: recordAsync(
      row?.control === 'toggle' ? 'settings-toggle' : 'settings-change'
    ),
    handleSettingReset: recordAsync('settings-reset'),
    handleRenameSubmit: notADialogAction,
    handleOutcomeRetry: notADialogAction,
    confirmBatchClose: notADialogAction,
    retryBatchClose: notADialogAction,
  }

  const consumed = handleModalKeyboard(input, ctx)

  if (actions.length > 1) throw new Error(`One key ran several actions: ${actions.join(', ')}`)

  return { actions, consumed }
}

function dialogHandlerBindings(dialog: DialogCase): string[] {
  return DIALOG_PRESSES.flatMap(key =>
    pressDialog(dialog, key.input).actions.map(action => `${key.label} => ${action}`)
  ).sort()
}

function dialogCatalogBindings(view: DialogView): string[] {
  return getDialogActions(view)
    .flatMap(id => getDialogActionKeys(id).map(key => `${key.label} => ${id}`))
    .sort()
}

describe('the action catalog lists exactly the keys the settings dialogs run', () => {
  test('every dialog action id is listed', () => {
    expect(EVERY_DIALOG_ACTION_LISTED).toBe(true)
    expect(new Set(DIALOG_CASES.flatMap(dialog => getDialogActions(dialog.view)))).toEqual(
      new Set(DIALOG_ACTION_IDS)
    )
  })

  test.each(DIALOG_CASES.map(dialog => [dialog.name, dialog] as const))('%s', (_name, dialog) => {
    expect(dialogHandlerBindings(dialog)).toEqual(dialogCatalogBindings(dialog.view))
  })

  test.each(DIALOG_CASES.map(dialog => [dialog.name, dialog] as const))(
    '%s: letters type into the field',
    (_name, dialog) => {
      for (const key of DIALOG_LETTER_PRESSES)
        expect(pressDialog(dialog, key.input).consumed).toBe(false)
    }
  )
})
