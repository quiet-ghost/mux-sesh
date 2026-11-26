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
} from '../src/app/action-catalog'
import { workspaceToItem } from '../src/multiplexer/items'
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

const FOOTER_ACTIONS: ReadonlyArray<readonly [ActionId, string]> = [
  ['select', 'select'],
  ['select', 'focus'],
  ['search', 'search'],
  ['new-session', 'new'],
  ['open-agents', 'agents'],
  ['kill-session', 'close'],
  ['back', 'back'],
]

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

                for (const [id, label] of FOOTER_ACTIONS) {
                  const hint = getActionKeyHint(ctx, id)

                  if (!hint || !footer.split('  ').includes(`${hint} ${label}`)) continue

                  expect({ footer, id, availability: availabilityOf(ctx, id) }).toEqual({
                    footer,
                    id,
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

    expect(getActionFooter(ctx, 'create')).toBe('enter create  esc cancel')
    expect(getActionFooter(ctx, 'focus')).toBe('enter focus  esc cancel')
    expect(getActionFooter(ctx, 'clone')).toBe('enter clone  esc cancel')
    expect(getActionFooter(ctx, 'none')).toBe('esc cancel')
    expect(getActionFooter(ctx)).toBe('esc cancel')
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

      expect(getActionFooter(ctx, 'create')).toBe(`enter create  ${rest}`)
      expect(getActionFooter(ctx, 'focus')).toBe(`enter focus  ${rest}`)
      expect(rest).not.toContain('enter')
      expect(getActionFooter({ ...ctx, target: { kind: 'none' } }, 'create')).toBe(
        getActionFooter({ ...ctx, target: { kind: 'none' } })
      )
      expect(getActionFooter({ ...ctx, viewMode: ViewMode.Sessions }, 'create')).toStartWith(
        'enter select  '
      )
    }
  })

  test('advertises available keys for a live session', () => {
    const ctx = context({ agentCount: 1, target: getActionTarget(session) })

    expect(getActionFooter(ctx)).toBe(
      'enter select  i search  n new  o agents  d close  ctrl+p commands  ctrl+x ...'
    )
    expect(getActionFooter(context())).toBe('i search  n new  ctrl+p commands  ctrl+x ...')
    expect(
      getActionFooter(context({ appMode: AppMode.AgentsManage, target: getActionTarget(agent) }))
    ).toBe('esc back  enter focus  ctrl+p commands  ctrl+x ...')
  })
})
