import { describe, expect, mock, test } from 'bun:test'
import { handleKillSession } from '../src/handlers/actions'
import { getItemKey } from '../src/multiplexer/items'
import type { LiveWorkspace, MultiplexerBackend, WorkspaceRef } from '../src/multiplexer'
import { CommandTimeoutError } from '../src/multiplexer/command'
import { MultiplexerError } from '../src/multiplexer/types'
import { CleanupPlan } from '../src/sessions/cleanup-plan'
import type { Item } from '../src/types'

function liveItem(id: string, title: string, backend: 'herdr' | 'tmux' = 'herdr'): Item {
  return {
    title,
    desc: '',
    path: `/tmp/${title}`,
    isSession: true,
    itemKind: backend,
    backend,
    sessionId: id,
  }
}

function planOf(item: Item): CleanupPlan {
  const review = CleanupPlan.review(item, [item], 0)

  if (review.kind === 'refused') throw new Error(review.reason)

  return review.plan
}

function createFakeBackend(opts: {
  kind?: 'herdr' | 'tmux'
  workspaces: Array<{ id: string; title: string }>
  focusedId: string
  /** When true, close always jumps focus to next remaining workspace (even if non-focused). */
  stealFocusOnAnyClose?: boolean
}): MultiplexerBackend & { focusedId: string; commands: string[][] } {
  const commands: string[][] = []

  const state = {
    focusedId: opts.focusedId,
    workspaces: opts.workspaces.map(workspace => ({ ...workspace })),
    commands,
  }

  const kind = opts.kind ?? 'herdr'

  const backend: MultiplexerBackend & { focusedId: string; commands: string[][] } = {
    get focusedId() {
      return state.focusedId
    },
    set focusedId(value: string) {
      state.focusedId = value
    },
    get commands() {
      return state.commands
    },
    kind,
    capabilities: { previousWorkspace: kind === 'tmux' },
    async list(): Promise<LiveWorkspace[]> {
      return state.workspaces.map(workspace => ({
        backend: kind,
        id: workspace.id,
        title: workspace.title,
        path: `/tmp/${workspace.title}`,
        isActive: workspace.id === state.focusedId,
        unitCount: 1,
      }))
    },
    async current() {
      const workspace = state.workspaces.find(entry => entry.id === state.focusedId)

      return workspace ? { backend: kind, id: workspace.id, title: workspace.title } : undefined
    },
    async open(workspace: WorkspaceRef) {
      state.commands.push(['open', workspace.id])

      if (!state.workspaces.some(entry => entry.id === workspace.id)) {
        throw new Error(`Cannot open missing workspace ${workspace.id}`)
      }

      state.focusedId = workspace.id

      return { kind: 'focused' as const }
    },
    async close(workspace: WorkspaceRef) {
      state.commands.push(['close', workspace.id])
      const index = state.workspaces.findIndex(entry => entry.id === workspace.id)

      if (index < 0) {
        throw new Error(`Cannot close missing workspace ${workspace.id}`)
      }

      const priorFocusedId = state.focusedId
      const closingFocused = priorFocusedId === workspace.id
      state.workspaces.splice(index, 1)

      if (closingFocused) {
        const next = state.workspaces[index] ?? state.workspaces[index - 1]
        state.focusedId = next?.id ?? ''

        return
      }

      if (opts.stealFocusOnAnyClose) {
        // Force drift away from the prior focus so restore logic can be asserted.
        const stolen =
          state.workspaces.find(entry => entry.id !== priorFocusedId) ?? state.workspaces[0]

        state.focusedId = stolen?.id ?? ''
      }
    },
    async openOrCreate() {
      throw new Error('not used')
    },
    async create() {
      throw new Error('not used')
    },
    async start() {
      throw new Error('not used')
    },
    async rename() {
      throw new Error('not used')
    },
    async directory() {
      return undefined
    },
    async details() {
      throw new Error('not used')
    },
    async openEditor() {
      return false
    },
  }

  return backend
}

interface RememberedSelection {
  key: string | null
}

function createCallbacks(regularSessions: Item[]) {
  const remembered: RememberedSelection = { key: 'unset' }
  const refreshItems = mock(async () => {})

  return {
    remembered,
    refreshItems,
    callbacks: {
      refreshItems,
      regularSessions,
      rememberedSessions: (key: string | null) => {
        remembered.key = key
      },
    },
  }
}

describe('handleKillSession focus stability (DEV-85)', () => {
  test('closing a non-focused workspace keeps prior focus', async () => {
    const backend = createFakeBackend({
      workspaces: [
        { id: 'a', title: 'alpha' },
        { id: 'b', title: 'beta' },
        { id: 'c', title: 'gamma' },
      ],
      focusedId: 'b',
    })

    const sessions = [liveItem('a', 'alpha'), liveItem('b', 'beta'), liveItem('c', 'gamma')]
    const { callbacks, refreshItems, remembered } = createCallbacks(sessions)

    const outcome = await handleKillSession(planOf(liveItem('a', 'alpha')), backend, callbacks)

    expect((await backend.current())?.id).toBe('b')
    expect(backend.commands).toEqual([['close', 'a']])
    expect(remembered.key).toBe(getItemKey(liveItem('b', 'beta')))
    expect(refreshItems).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ kind: 'completed', message: "Workspace 'alpha' closed" })
  })

  test('restores prior focus when close steals focus from a non-active workspace', async () => {
    const backend = createFakeBackend({
      workspaces: [
        { id: 'a', title: 'alpha' },
        { id: 'b', title: 'beta' },
        { id: 'c', title: 'gamma' },
      ],
      focusedId: 'b',
      stealFocusOnAnyClose: true,
    })

    const sessions = [liveItem('a', 'alpha'), liveItem('b', 'beta'), liveItem('c', 'gamma')]
    const { callbacks } = createCallbacks(sessions)

    await handleKillSession(planOf(liveItem('a', 'alpha')), backend, callbacks)

    expect((await backend.current())?.id).toBe('b')
    expect(backend.commands).toEqual([
      ['close', 'a'],
      ['open', 'b'],
    ])
  })

  test('closing the focused workspace lands on the previous neighbor', async () => {
    const backend = createFakeBackend({
      workspaces: [
        { id: 'a', title: 'alpha' },
        { id: 'b', title: 'beta' },
        { id: 'c', title: 'gamma' },
      ],
      focusedId: 'b',
    })

    const sessions = [liveItem('a', 'alpha'), liveItem('b', 'beta'), liveItem('c', 'gamma')]
    const { callbacks, remembered } = createCallbacks(sessions)

    await handleKillSession(planOf(liveItem('b', 'beta')), backend, callbacks)

    expect((await backend.current())?.id).toBe('a')
    expect(remembered.key).toBe(getItemKey(liveItem('a', 'alpha')))
    expect(backend.commands[0]).toEqual(['close', 'b'])
    expect(backend.commands.some(command => command[0] === 'open' && command[1] === 'a')).toBe(true)
  })

  test('closing the first focused workspace lands on the next neighbor', async () => {
    const backend = createFakeBackend({
      workspaces: [
        { id: 'a', title: 'alpha' },
        { id: 'b', title: 'beta' },
      ],
      focusedId: 'a',
    })

    const sessions = [liveItem('a', 'alpha'), liveItem('b', 'beta')]
    const { callbacks, remembered } = createCallbacks(sessions)

    await handleKillSession(planOf(liveItem('a', 'alpha')), backend, callbacks)

    expect((await backend.current())?.id).toBe('b')
    expect(remembered.key).toBe(getItemKey(liveItem('b', 'beta')))
  })

  test('closing the only workspace clears selection memory and still refreshes', async () => {
    const backend = createFakeBackend({
      workspaces: [{ id: 'a', title: 'alpha' }],
      focusedId: 'a',
    })

    const sessions = [liveItem('a', 'alpha')]
    const { callbacks, remembered, refreshItems } = createCallbacks(sessions)

    const outcome = await handleKillSession(planOf(liveItem('a', 'alpha')), backend, callbacks)

    expect(await backend.current()).toBeUndefined()
    expect(remembered.key).toBeNull()
    expect(backend.commands).toEqual([['close', 'a']])
    expect(refreshItems).toHaveBeenCalledTimes(1)
    expect(outcome.kind).toBe('completed')
  })

  test('remembers neighbor selection before refresh for list cursor stability', async () => {
    const backend = createFakeBackend({
      workspaces: [
        { id: 'a', title: 'alpha' },
        { id: 'b', title: 'beta' },
        { id: 'c', title: 'gamma' },
      ],
      focusedId: 'c',
    })

    const sessions = [liveItem('a', 'alpha'), liveItem('b', 'beta'), liveItem('c', 'gamma')]
    const callOrder: string[] = []

    const refreshItems = mock(async () => {
      callOrder.push('refresh')
    })

    await handleKillSession(planOf(liveItem('b', 'beta')), backend, {
      refreshItems,
      regularSessions: sessions,
      rememberedSessions: key => {
        callOrder.push(`remember:${key}`)
      },
    })

    expect(callOrder[0]).toBe('remember:herdr:a')
    expect(callOrder).toContain('refresh')
    expect(callOrder.indexOf('remember:herdr:a')).toBeLessThan(callOrder.indexOf('refresh'))
  })

  test('tmux backend closes and keeps non-focused session focus stable', async () => {
    const backend = createFakeBackend({
      kind: 'tmux',
      workspaces: [
        { id: 'dev', title: 'dev' },
        { id: 'ops', title: 'ops' },
      ],
      focusedId: 'ops',
    })

    const sessions = [liveItem('dev', 'dev', 'tmux'), liveItem('ops', 'ops', 'tmux')]
    const { callbacks, remembered } = createCallbacks(sessions)

    const outcome = await handleKillSession(
      planOf(liveItem('dev', 'dev', 'tmux')),
      backend,
      callbacks
    )

    expect((await backend.current())?.id).toBe('ops')
    expect(remembered.key).toBe(getItemKey(liveItem('ops', 'ops', 'tmux')))
    expect(outcome).toEqual({ kind: 'completed', message: "Session 'dev' closed" })
  })

  // A close needs a reviewed plan, and non-session items never produce one.
  test('rejects non-session items before any plan reaches the backend', () => {
    const review = CleanupPlan.review(
      { title: 'project', desc: '', path: '/tmp/project', isSession: false },
      [],
      0
    )

    expect(review).toEqual({
      kind: 'refused',
      reason: 'Select a live session to close. Nothing was closed.',
    })
  })

  test('still refreshes after a successful close when focus restore fails', async () => {
    const backend = createFakeBackend({
      workspaces: [
        { id: 'a', title: 'alpha' },
        { id: 'b', title: 'beta' },
        { id: 'c', title: 'gamma' },
      ],
      focusedId: 'b',
      stealFocusOnAnyClose: true,
    })

    const originalOpen = backend.open.bind(backend)
    backend.open = async workspace => {
      if (workspace.id === 'b') {
        throw new Error('focus restore failed')
      }

      return originalOpen(workspace)
    }

    const sessions = [liveItem('a', 'alpha'), liveItem('b', 'beta'), liveItem('c', 'gamma')]
    const { callbacks, refreshItems, remembered } = createCallbacks(sessions)

    const outcome = await handleKillSession(planOf(liveItem('a', 'alpha')), backend, callbacks)

    expect(backend.commands[0]).toEqual(['close', 'a'])
    expect(remembered.key).toBe(getItemKey(liveItem('b', 'beta')))
    expect(refreshItems).toHaveBeenCalledTimes(1)
    expect(outcome.kind).toBe('partial')
  })
})

describe('close outcomes (DEV-341)', () => {
  const sessions = () => [liveItem('a', 'alpha'), liveItem('b', 'beta')]

  test('a completed close with failed focus restore reports the close and the restore failure', async () => {
    const backend = createFakeBackend({
      workspaces: [
        { id: 'a', title: 'alpha' },
        { id: 'b', title: 'beta' },
        { id: 'c', title: 'gamma' },
      ],
      focusedId: 'b',
      stealFocusOnAnyClose: true,
    })

    backend.open = async () => {
      throw new Error('fixture focus failed')
    }

    const { callbacks } = createCallbacks(sessions())

    const outcome = await handleKillSession(planOf(liveItem('a', 'alpha')), backend, callbacks)

    expect(outcome).toEqual({
      kind: 'partial',
      title: "Workspace 'alpha' closed, but focus did not return",
      completed: ["Closed workspace 'alpha'"],
      failed: "Returning focus to 'beta': fixture focus failed",
      next: 'Nothing else was closed. Pick a workspace from the list to continue.',
      retry: { kind: 'none' },
    })
  })

  test('a refused close says nothing was closed and does not refresh or move focus', async () => {
    const backend = createFakeBackend({ workspaces: [{ id: 'a', title: 'alpha' }], focusedId: 'a' })

    backend.close = async () => {
      throw new MultiplexerError('unsupported', 'Cannot close an agent tab from mux-sesh.')
    }

    const { callbacks, refreshItems } = createCallbacks(sessions())

    const outcome = await handleKillSession(planOf(liveItem('a', 'alpha')), backend, callbacks)

    expect(outcome).toEqual({
      kind: 'failed',
      message:
        "Could not close workspace 'alpha': Cannot close an agent tab from mux-sesh. Nothing was closed.",
    })
    expect(refreshItems).not.toHaveBeenCalled()
    expect(backend.commands).toEqual([])
  })

  test('a close with an unknown outcome refreshes instead of retrying or moving focus', async () => {
    const backend = createFakeBackend({
      workspaces: [
        { id: 'a', title: 'alpha' },
        { id: 'b', title: 'beta' },
      ],
      focusedId: 'b',
    })

    backend.close = async () => {
      throw new CommandTimeoutError({ executable: 'herdr', timeoutMs: 15_000 })
    }

    const { callbacks, refreshItems } = createCallbacks(sessions())

    const outcome = await handleKillSession(planOf(liveItem('a', 'alpha')), backend, callbacks)

    expect(outcome).toMatchObject({
      kind: 'unknown',
      title: "Closing workspace 'alpha' did not finish",
      completed: [],
      attempted: "Close workspace 'alpha'",
    })
    expect(refreshItems).toHaveBeenCalledTimes(1)
    expect(backend.commands).toEqual([])
  })

  test('a failed refresh after a completed close is not swallowed', async () => {
    const backend = createFakeBackend({ workspaces: [{ id: 'a', title: 'alpha' }], focusedId: 'a' })
    const { callbacks } = createCallbacks([liveItem('a', 'alpha')])
    const defect = new TypeError('fixture refresh defect')

    const failingRefresh = {
      ...callbacks,
      refreshItems: async () => {
        throw defect
      },
    }

    expect.assertions(1)

    try {
      await handleKillSession(planOf(liveItem('a', 'alpha')), backend, failingRefresh)
    } catch (cause) {
      expect(cause).toBe(defect)
    }
  })
})
