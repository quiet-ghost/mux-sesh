import { describe, expect, test } from 'bun:test'
import {
  describeUnavailableAction,
  getActionKeys,
  getActionTarget,
  getCommandEntry,
  type ActionContext,
  type ActionId,
} from '../src/app/action-catalog'
import {
  getDialogActionKeys,
  getDialogActions,
  type DialogActionId,
  type DialogKey,
  type DialogView,
  type ListRowKind,
  type ListStepKind,
  type RuleRowControl,
} from '../src/app/dialog-actions'
import { handleModalKeyboard } from '../src/app/keyboard/modal-keyboard'
import type { ModalState } from '../src/app/modals'
import { OptionPicker } from '../src/app/option-picker'
import { PendingClose } from '../src/app/pending-close'
import { SettingPane } from '../src/app/setting-panes'
import type { NewSessionStepControls } from '../src/app/new-session-step'
import { handleAgentsManageMode } from '../src/app/keyboard/agents'
import { handleNewSessionMode } from '../src/app/keyboard/new-session'
import { handleNormalMode } from '../src/app/keyboard/normal'
import { handleSearchMode } from '../src/app/keyboard/search'
import type { KeyboardHandlerContext, KeyboardInput } from '../src/app/keyboard/shared'
import type {
  SettingsControl,
  SettingsEntry,
  SettingsReset,
} from '../src/settings/settings-catalog'
import type { IconsFormAction, IconsFormEntry } from '../src/settings/settings-icons'
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
  readonly input: { name: string; ctrl?: boolean; shift?: boolean }
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
  { label: 'shift+↑', input: { name: 'up', shift: true } },
  { label: 'shift+↓', input: { name: 'down', shift: true } },
  { label: 'enter', input: { name: 'return' } },
  { label: 'esc', input: { name: 'escape' } },
]

interface DialogCase {
  readonly name: string
  readonly view: DialogView
  readonly modalState: ModalState
  readonly entry: SettingsEntry | undefined
  // A focused text field takes every letter; a list pane without one acts on letters.
  readonly focus: 'field' | 'none'
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
const LIST_ROWS: readonly ListRowKind[] = ['item', 'add', 'json']
const LIST_STEPS: readonly ListStepKind[] = ['browsing', 'confirming', 'editing', 'adding']
const KEYBIND_MODES: readonly KeybindMode[] = ['vim', 'standard']
const RULE_STEPS = ['browsing', 'editing'] as const

const RULE_ROWS: readonly (RuleRowControl | undefined)[] = [
  undefined,
  { control: 'edit', reset: 'none' },
  { control: 'edit', reset: 'available' },
  { control: 'toggle', reset: 'none' },
  { control: 'toggle', reset: 'available' },
]

const ICONS_ROWS: readonly Pick<IconsFormEntry, 'row' | 'reset'>[] = [
  { row: 'enabled', reset: 'default' },
  { row: 'enabled', reset: 'unavailable' },
  { row: 'herdr', reset: 'default' },
  { row: 'herdr', reset: 'available' },
]

function iconsEntry({ row, reset }: Pick<IconsFormEntry, 'row' | 'reset'>): IconsFormEntry {
  const shared = { title: 'Fixture icon', value: 'value', description: 'An icon for key checks' }

  return row === 'enabled'
    ? { ...shared, row, control: 'toggle', reset }
    : { ...shared, row, glyph: 'H', control: 'open', reset }
}

// The Icons form rows the keyboard sees for each case.
function iconsFormEntries(dialog: DialogCase): IconsFormEntry[] {
  if (dialog.view.kind !== 'icons-form') return []

  if (dialog.view.mode === 'editing') return [iconsEntry({ row: 'herdr', reset: 'default' })]

  const { entry } = dialog.view
  const row = dialog.modalState?.type === 'icons-form' ? dialog.modalState.row : 'enabled'

  return entry ? [iconsEntry({ row, reset: entry.reset })] : []
}

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
          focus: 'field',
        } satisfies DialogCase
      })
    )
  ),
  {
    name: 'Settings with no match',
    view: { kind: 'settings', entry: undefined, query: 'zzz' },
    modalState: { type: 'settings', picker: OptionPicker.browsing },
    entry: undefined,
    focus: 'field',
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
    focus: 'field',
  },
  {
    name: 'setting editor',
    view: { kind: 'setting-editor' },
    modalState: { type: 'setting-editor', field: 'startupCommand' },
    entry: undefined,
    focus: 'field',
  },
  ...LIST_ROWS.flatMap(row =>
    LIST_STEPS.flatMap(step =>
      KEYBIND_MODES.map((keybindMode): DialogCase => ({
        name: `list pane ${row} ${step} ${keybindMode}`,
        view: { kind: 'setting-list', row, step, keybindMode },
        modalState: SettingPane.openList('hiddenSessions'),
        entry: undefined,
        focus: step === 'editing' || step === 'adding' ? 'field' : 'none',
      }))
    )
  ),
  ...RULE_ROWS.flatMap(row =>
    RULE_STEPS.map((step): DialogCase => ({
      name: `rule form ${row ? `${row.control} ${row.reset}` : 'no row'} ${step}`,
      view: { kind: 'setting-rule', row, step },
      modalState: SettingPane.openRule('projects', 0),
      entry: undefined,
      focus: step === 'editing' ? 'field' : 'none',
    }))
  ),
  {
    name: 'raw JSON editor',
    view: { kind: 'setting-json' },
    modalState: { type: 'setting-json', field: 'projects', from: undefined },
    entry: undefined,
    focus: 'field',
  },
  ...ICONS_ROWS.map(row => {
    const entry = iconsEntry(row)

    return {
      name: `Icons form ${row.row} ${row.reset}`,
      view: { kind: 'icons-form', mode: 'browsing', entry },
      modalState: { type: 'icons-form', row: row.row, mode: { kind: 'browsing' } },
      entry: undefined,
      focus: 'none',
    } satisfies DialogCase
  }),
  {
    name: 'Icons form editing a glyph',
    view: { kind: 'icons-form', mode: 'editing' },
    modalState: { type: 'icons-form', row: 'herdr', mode: { kind: 'editing', icon: 'herdr' } },
    entry: undefined,
    focus: 'field',
  },
]

// The action a dialog ran, from the dialog state it moved to.
function modalStateAction(dialog: DialogCase, next: ModalState): DialogActionId {
  switch (dialog.view.kind) {
    case 'setting-editor':
      return 'editor-back'
    case 'setting-json':
      return 'json-back'
    case 'icons-form':
      if (next?.type !== 'icons-form') return 'icons-back'

      if (dialog.view.mode === 'editing') return 'icons-cancel'

      return next.mode.kind === 'editing' ? 'icons-edit' : 'icons-move'
    case 'settings':
    case 'setting-options':
    case 'setting-list':
    case 'setting-rule':
      return 'option-back'
  }
}

// What a form change asked for, as the action that asked.
function iconsAction(action: IconsFormAction): DialogActionId {
  switch (action.kind) {
    case 'toggle':
      return 'icons-toggle'
    case 'apply':
      return 'icons-apply'
    case 'clear':
      return 'icons-clear'
  }
}

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
    setModalState: next => {
      actions.push(modalStateAction(dialog, next))
    },
    setSettingEditorError: () => {},
    insertSettingEditorNewline: record('json-newline'),
    setSettingEditorValue: () => {},
    iconsFormEntries: iconsFormEntries(dialog),
    handleIconsChange: async action => {
      actions.push(iconsAction(action))
    },
    runAction: task => {
      task().catch(cause => {
        throw cause
      })
    },
    executeCommand: notADialogAction,
    showToast: notADialogAction,
    handleSettingOptionSubmit: recordAsync('option-apply'),
    handleSettingsEditorSubmit: recordAsync(
      dialog.view.kind === 'setting-json' ? 'json-save' : 'editor-apply'
    ),
    handleSettingStep: recordAsync(
      row?.control === 'toggle' ? 'settings-toggle' : 'settings-change'
    ),
    handleSettingReset: recordAsync('settings-reset'),
    handleRenameSubmit: notADialogAction,
    handleOutcomeRetry: notADialogAction,
    confirmBatchClose: notADialogAction,
    retryBatchClose: notADialogAction,
    settingPaneView:
      dialog.view.kind === 'setting-list' || dialog.view.kind === 'setting-rule'
        ? dialog.view
        : undefined,
    openSettingPane: record('settings-open'),
    handleSettingPaneAction: async action => {
      actions.push(action.id)
    },
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

// Keys for vim only are offered only while a list pane is in vim mode.
function offeredIn(view: DialogView, key: DialogKey): boolean {
  return key.modes === 'any' || (view.kind === 'setting-list' && view.keybindMode === 'vim')
}

function dialogCatalogBindings(view: DialogView): string[] {
  return getDialogActions(view)
    .flatMap(id =>
      getDialogActionKeys(id)
        .filter(key => offeredIn(view, key))
        .map(key => `${key.label} => ${id}`)
    )
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
      if (dialog.focus === 'none') return

      for (const key of DIALOG_LETTER_PRESSES)
        expect(pressDialog(dialog, key.input).consumed).toBe(false)
    }
  )
})
