import { describe, expect, test } from 'bun:test'
import {
  getActionAvailability,
  getActionFooter,
  getActionKeyHint,
  getActionTarget,
  getCommandEntries,
  type ActionBackend,
  type ActionContext,
  type ActionId,
  type ActionTarget,
  type FooterHint,
} from '../src/app/action-catalog'
import { getItemKey, workspaceToItem } from '../src/multiplexer/items'
import { AppMode, ViewMode, type Item, type KeybindMode } from '../src/types'

const tmux: ActionBackend = { kind: 'tmux', capabilities: { previousWorkspace: true } }
const herdr: ActionBackend = { kind: 'herdr', capabilities: { previousWorkspace: false } }

const session = workspaceToItem({
  backend: 'tmux',
  id: 'alpha',
  title: 'alpha',
  path: '/fixture/alpha',
  isActive: false,
  unitCount: 1,
})

const agent = workspaceToItem({
  backend: 'herdr',
  id: 'agents',
  title: 'agent-one',
  path: '/fixture/one',
  isActive: false,
  unitCount: 1,
  target: { kind: 'agent', tabId: 'agents:t1', paneId: 'agents:p1' },
})

const project: Item = {
  title: 'api',
  desc: '',
  path: '/fixture/api',
  isSession: false,
  itemKind: 'project',
}

const configured: Item = { ...project, itemKind: 'configured' }
const file: Item = { ...project, itemKind: 'file' }

function context(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    appMode: AppMode.Normal,
    viewMode: ViewMode.Sessions,
    keybindMode: 'vim',
    prefixKey: 'ctrl+x',
    backend: tmux,
    agentCount: 0,
    target: { kind: 'none' },
    marked: new Map(),
    ...overrides,
  }
}

function availabilityOf(ctx: ActionContext, id: ActionId) {
  return getActionAvailability(ctx, id).kind
}

describe('action catalog availability', () => {
  test('classifies exact targets', () => {
    expect(getActionTarget(undefined).kind).toBe('none')
    expect(getActionTarget(session).kind).toBe('session')
    expect(getActionTarget(agent).kind).toBe('agent')
    expect(getActionTarget(project).kind).toBe('project')
    expect(getActionTarget(configured).kind).toBe('configured')
    expect(getActionTarget(file).kind).toBe('file')
  })

  test.each([AppMode.Normal, AppMode.Search])(
    'keeps global actions available without a selection in mode %d',
    appMode => {
      const entries = getCommandEntries(context({ appMode }))

      const available = entries
        .filter(entry => entry.availability.kind === 'available')
        .map(entry => entry.id)

      for (const id of [
        'search',
        'new-session',
        'open-settings',
        'open-themes',
        'view-projects',
        'view-sessions',
        'last-session',
        'refresh',
      ] as const) {
        expect(available).toContain(id)
      }

      expect(available).not.toContain('kill-session')
      expect(available).not.toContain('rename-session')
      expect(available).not.toContain('open-agents')
      expect(entries.find(entry => entry.id === 'refresh')?.scope).toBe('global')
      expect(entries.find(entry => entry.id === 'kill-session')?.scope).toBe('target')
    }
  )

  test('offers agents only when some exist in the sessions view', () => {
    expect(availabilityOf(context({ agentCount: 1 }), 'open-agents')).toBe('available')
    expect(getActionAvailability(context(), 'open-agents')).toEqual({
      kind: 'unavailable',
      reason: 'No agent sessions',
    })
    expect(
      availabilityOf(context({ agentCount: 1, viewMode: ViewMode.Projects }), 'open-agents')
    ).toBe('unavailable')
  })

  test.each([AppMode.AgentsManage, AppMode.Search, AppMode.Normal])(
    'refuses rename and close for a Herdr agent target in mode %d',
    appMode => {
      const ctx = context({ appMode, target: getActionTarget(agent) })

      expect(getActionAvailability(ctx, 'rename-session')).toEqual({
        kind: 'unavailable',
        reason: 'Rename it in Herdr',
      })
      expect(getActionAvailability(ctx, 'kill-session')).toEqual({
        kind: 'unavailable',
        reason: 'Close it in Herdr',
      })
    }
  )

  test('derives previous session from backend capabilities', () => {
    expect(availabilityOf(context(), 'last-session')).toBe('available')
    expect(getActionAvailability(context({ backend: herdr }), 'last-session')).toEqual({
      kind: 'unavailable',
      reason: 'Herdr does not track the previous workspace',
    })
    expect(availabilityOf(context({ backend: null }), 'last-session')).toBe('unavailable')
  })

  test('makes every target action available for a live tmux session', () => {
    const ctx = context({ target: getActionTarget(session) })

    for (const id of ['rename-session', 'kill-session', 'toggle-pin-session', 'root-session']) {
      expect(getCommandEntries(ctx).find(entry => entry.id === id)).toMatchObject({
        scope: 'target',
        availability: { kind: 'available' },
      })
    }

    expect(availabilityOf(ctx, 'edit-target')).toBe('unavailable')
    expect(availabilityOf(context({ target: getActionTarget(configured) }), 'edit-target')).toBe(
      'available'
    )
  })
})

describe('action catalog key hints', () => {
  test('follows the keybinding mode and prefix key', () => {
    const target = getActionTarget(session)

    expect(getActionKeyHint(context({ prefixKey: undefined, target }), 'rename-session')).toBe('r')
    expect(getActionKeyHint(context({ target }), 'rename-session')).toBe('ctrl+x r')
    expect(getActionKeyHint(context({ prefixKey: undefined }), 'refresh')).toBe('R')
    expect(
      getActionKeyHint(
        context({ appMode: AppMode.Search, keybindMode: 'standard', target }),
        'kill-session'
      )
    ).toBe('ctrl+x d')
    expect(getActionKeyHint(context({ appMode: AppMode.Search }), 'kill-session')).toBe('')
    expect(getActionKeyHint(context({ appMode: AppMode.AgentsManage }), 'back')).toBe('esc')
  })

  test('offers the details toggle in both keybinding modes without a new direct standard key', () => {
    const standard = context({ keybindMode: 'standard' })

    expect(getActionKeyHint(context(), 'toggle-details')).toBe('v')
    expect(getActionKeyHint(context({ appMode: AppMode.AgentsManage }), 'toggle-details')).toBe('v')
    expect(getActionKeyHint(context({ appMode: AppMode.Search }), 'toggle-details')).toBe('')
    expect(getActionKeyHint(standard, 'toggle-details')).toBe('ctrl+x v')
    expect(getActionKeyHint({ ...standard, appMode: AppMode.Search }, 'toggle-details')).toBe(
      'ctrl+x v'
    )
    expect(getActionKeyHint({ ...standard, prefixKey: undefined }, 'toggle-details')).toBe('')

    for (const appMode of [AppMode.Normal, AppMode.AgentsManage]) {
      expect(getCommandEntries(context({ appMode })).map(entry => entry.id)).toContain(
        'toggle-details'
      )
    }
  })
})

const CANCEL: FooterHint = { id: 'cancel', label: 'cancel', key: 'esc' }
const COMMANDS: FooterHint = { id: 'open-commands', label: 'commands', key: 'ctrl+p' }
const PREFIX: FooterHint = { id: 'prefix', label: 'prefix', key: 'ctrl+x' }

function enter(label: string): FooterHint {
  return { id: 'select', label, key: 'enter' }
}

const TARGETS: ActionTarget[] = [session, agent, project, configured, file, undefined].map(
  getActionTarget
)

const MODES: KeybindMode[] = ['vim', 'standard']

describe('action catalog footer', () => {
  test('never advertises an unavailable action', () => {
    const appModes = [AppMode.Normal, AppMode.Search, AppMode.AgentsManage, AppMode.NewSession]

    for (const appMode of appModes) {
      for (const keybindMode of MODES) {
        for (const prefixKey of ['ctrl+x', undefined]) {
          for (const backend of [tmux, herdr, null]) {
            for (const agentCount of [0, 2]) {
              for (const target of TARGETS) {
                const ctx = context({
                  appMode,
                  keybindMode,
                  prefixKey,
                  backend,
                  agentCount,
                  target,
                })

                const footer = getActionFooter(ctx)

                for (const hint of [...footer.global, ...footer.target]) {
                  if (hint.id === 'prefix' || hint.id === 'cancel') continue

                  expect({ hint, availability: availabilityOf(ctx, hint.id) }).toEqual({
                    hint,
                    availability: 'available',
                  })
                }
              }
            }
          }
        }
      }
    }
  })

  test.each(MODES)('%s New footer names the frozen plan action, never a guess', keybindMode => {
    const ctx = context({ appMode: AppMode.NewSession, keybindMode })

    for (const action of ['create', 'focus', 'clone'] as const) {
      expect(getActionFooter(ctx, action)).toEqual({ global: [CANCEL], target: [enter(action)] })
    }

    expect(getActionFooter(ctx, 'none')).toEqual({ global: [CANCEL], target: [] })
    expect(getActionFooter(ctx)).toEqual({ global: [CANCEL], target: [] })
  })

  test.each(MODES)('%s Projects footer names the frozen plan action for Enter', keybindMode => {
    for (const appMode of [AppMode.Normal, AppMode.Search]) {
      const ctx = context({
        appMode,
        keybindMode,
        viewMode: ViewMode.Projects,
        target: getActionTarget(project),
      })

      const rest = getActionFooter(ctx, 'none')

      expect(getActionFooter(ctx, 'create')).toEqual({
        ...rest,
        target: [enter('create'), ...rest.target],
      })
      expect(getActionFooter(ctx, 'focus')).toEqual({
        ...rest,
        target: [enter('focus'), ...rest.target],
      })
      expect(rest.target.map(hint => hint.id)).not.toContain('select')
      expect(getActionFooter({ ...ctx, target: { kind: 'none' } }, 'create')).toEqual(
        getActionFooter({ ...ctx, target: { kind: 'none' } })
      )
      expect(getActionFooter({ ...ctx, viewMode: ViewMode.Sessions }, 'create').target[0]).toEqual(
        enter('select')
      )
    }
  })

  test('advertises screen keys on the left and row keys on the right', () => {
    const ctx = context({ agentCount: 1, target: getActionTarget(session) })

    expect(getActionFooter(ctx)).toEqual({
      global: [
        { id: 'search', label: 'search', key: 'i' },
        { id: 'new-session', label: 'new', key: 'n' },
        { id: 'open-agents', label: 'agents', key: 'o' },
        COMMANDS,
        PREFIX,
      ],
      target: [enter('select'), { id: 'kill-session', label: 'close', key: 'd' }],
    })
    expect(getActionFooter(context())).toEqual({
      global: [
        { id: 'search', label: 'search', key: 'i' },
        { id: 'new-session', label: 'new', key: 'n' },
        COMMANDS,
        PREFIX,
      ],
      target: [],
    })
    expect(
      getActionFooter(context({ appMode: AppMode.AgentsManage, target: getActionTarget(agent) }))
    ).toEqual({
      global: [{ id: 'back', label: 'back', key: 'esc' }, COMMANDS, PREFIX],
      target: [enter('focus')],
    })
    expect(getActionFooter(context({ prefixKey: undefined })).global.at(-1)).toEqual({
      id: 'prefix',
      label: 'direct keys',
      key: '',
    })
  })

  test('a batch close names the marked count on the right', () => {
    const marked = new Map([[getItemKey(session), session]])
    const ctx = context({ target: getActionTarget(session), marked })

    expect(getActionFooter(ctx).target).toEqual([
      enter('select'),
      { id: 'kill-session', label: 'close 1 marked', key: 'd' },
    ])
  })
})
