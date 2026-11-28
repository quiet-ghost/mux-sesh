import { afterEach, describe, expect, test } from 'bun:test'
import type {
  LiveWorkspace,
  MultiplexerBackend,
  WorkspaceDetails,
  WorkspaceRef,
} from '../src/multiplexer'
import type { CommandOptions } from '../src/multiplexer/command'
import { MultiplexerError } from '../src/multiplexer/types'
import type { KeybindMode } from '../src/config/config-model'
import { renderSessionScreen } from './fixtures/session-screen'
import { listRow, selectedRowText } from './fixtures/selection'
import { unsupportedBackend } from './fixtures/fake-backend'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.renderer.isDestroyed).toBe(true)
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
  expect(fixture.renderer.stdin.listenerCount('data')).toBe(0)
})

const MODES: KeybindMode[] = ['vim', 'standard']

function workspace(id: string, isActive = false): LiveWorkspace {
  return { backend: 'tmux', id, title: id, path: `/fixture/${id}`, isActive, unitCount: 2 }
}

function detailsFor(ref: WorkspaceRef, window: string): WorkspaceDetails {
  return {
    workspace: ref,
    isActive: false,
    unitLabel: 'Windows',
    units: [{ id: '1', name: window, currentPath: '/fixture', currentCommand: '' }],
    agents: [],
  }
}

interface DetailsRead {
  readonly id: string
  readonly signal: AbortSignal | undefined
  resolve(details: WorkspaceDetails): void
  reject(error: Error): void
}

// details() stays pending until the test settles it, so completion order is the test's choice.
function createDeferredBackend(rows: LiveWorkspace[]) {
  const reads: DetailsRead[] = []

  const backend: MultiplexerBackend = unsupportedBackend({
    kind: 'tmux',
    capabilities: { previousWorkspace: false },
    async list() {
      return rows
    },
    details(ref: WorkspaceRef, options?: CommandOptions) {
      const { promise, resolve, reject } = Promise.withResolvers<WorkspaceDetails>()
      reads.push({ id: ref.id, signal: options?.signal, resolve, reject })

      return promise
    },
  })

  return {
    backend,
    reads,
    read(index: number): DetailsRead {
      const read = reads[index]

      if (!read) throw new Error(`details() was called ${reads.length} times, not ${index + 1}`)

      return read
    },
  }
}

async function toggleDetails(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('Toggle details')
  await fixture.pressKey('RETURN')
  await fixture.settle()
}

async function refresh(fixture: Screen): Promise<void> {
  await fixture.pressKey('x', { ctrl: true })
  await fixture.pressKey('R', { shift: true })
  await fixture.settle()
}

async function move(fixture: Screen, key: 'ARROW_DOWN' | 'ARROW_UP'): Promise<void> {
  await fixture.pressKey(key)
  await fixture.settle()
}

describe('details stay compact during routine navigation', () => {
  test.each(MODES)('%s navigation at 120 columns reads no details', async keybindMode => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { keybindMode })

    for (const key of ['ARROW_DOWN', 'ARROW_UP', 'ARROW_DOWN'] as const) await move(screen, key)

    const frame = await screen.frame()
    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))
    expect(frame).toContain('Status inactive')
    expect(frame).toContain('Toggle details')
    expect(screen.calls).toEqual([{ operation: 'list' }])
  })
})

describe('the details key', () => {
  test.each(MODES)('%s key opens the inspector and closes it again', async keybindMode => {
    const deferred = createDeferredBackend([workspace('alpha'), workspace('beta')])
    screen = await renderSessionScreen(
      { width: 120, height: 36 },
      { keybindMode, backend: deferred.backend }
    )

    const pressDetailsKey = async (fixture: Screen): Promise<void> => {
      if (keybindMode === 'standard') await fixture.pressKey('x', { ctrl: true })
      await fixture.pressKey('v')
      await fixture.settle()
    }

    await pressDetailsKey(screen)
    expect(await screen.frame()).toContain('Loading…')
    expect(deferred.reads).toHaveLength(1)

    await pressDetailsKey(screen)
    expect(deferred.read(0).signal?.aborted).toBe(true)
    expect(await screen.frame()).not.toContain('Loading…')
  })
})

describe('inspecting details on request', () => {
  test('a slower earlier selection never replaces the latest one', async () => {
    const deferred = createDeferredBackend([workspace('alpha'), workspace('beta')])
    screen = await renderSessionScreen({ width: 120, height: 36 }, { backend: deferred.backend })

    await toggleDetails(screen)
    expect(await screen.frame()).toContain('Loading…')
    await move(screen, 'ARROW_DOWN')

    const alpha = deferred.read(0)
    const beta = deferred.read(1)
    expect([alpha.id, beta.id]).toEqual(['alpha', 'beta'])
    expect(alpha.signal?.aborted).toBe(true)

    beta.resolve(detailsFor({ backend: 'tmux', id: 'beta', title: 'beta' }, 'beta-window'))
    await screen.settle()
    alpha.resolve(detailsFor({ backend: 'tmux', id: 'alpha', title: 'alpha' }, 'alpha-window'))
    await screen.settle()

    const frame = await screen.frame()
    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))
    expect(frame).toContain('beta-window')
    expect(frame).not.toContain('alpha-window')
  })

  test('manual refresh reloads the inspected details', async () => {
    const deferred = createDeferredBackend([workspace('alpha')])
    screen = await renderSessionScreen({ width: 120, height: 36 }, { backend: deferred.backend })

    await toggleDetails(screen)
    deferred.read(0).resolve(detailsFor({ backend: 'tmux', id: 'alpha', title: 'alpha' }, 'first'))
    await screen.settle()
    expect(await screen.frame()).toContain('first')

    await refresh(screen)
    deferred.read(1).resolve(detailsFor({ backend: 'tmux', id: 'alpha', title: 'alpha' }, 'second'))
    await screen.settle()

    const frame = await screen.frame()
    expect(frame).toContain('second')
    expect(frame).not.toContain('first')
  })

  test('a failed reload keeps earlier details labeled stale', async () => {
    const deferred = createDeferredBackend([workspace('alpha')])
    screen = await renderSessionScreen({ width: 120, height: 36 }, { backend: deferred.backend })

    await toggleDetails(screen)
    deferred.read(0).resolve(detailsFor({ backend: 'tmux', id: 'alpha', title: 'alpha' }, 'first'))
    await screen.settle()

    await refresh(screen)
    deferred.read(1).reject(new MultiplexerError('server-stopped', 'fixture server stopped'))
    await screen.settle()

    const frame = await screen.frame()
    expect(await selectedRowText(screen)).toMatch(listRow('.*alpha'))
    expect(frame).toContain('first')
    expect(frame).toContain('Stale')
    expect(frame).toContain('fixture server stopped')
  })

  test('a failed first read stays inside the panel', async () => {
    const deferred = createDeferredBackend([workspace('alpha'), workspace('beta')])
    screen = await renderSessionScreen({ width: 120, height: 36 }, { backend: deferred.backend })

    await toggleDetails(screen)
    deferred.read(0).reject(new MultiplexerError('command-failed', 'fixture capture failed'))
    await screen.settle()

    expect(await screen.frame()).toContain('fixture capture failed')
    await move(screen, 'ARROW_DOWN')
    expect(await selectedRowText(screen)).toMatch(listRow('.*beta'))
    expect(deferred.reads.map(read => read.id)).toEqual(['alpha', 'beta'])
  })

  test('closing the inspector cancels its read and ignores the late result', async () => {
    const deferred = createDeferredBackend([workspace('alpha'), workspace('beta')])
    screen = await renderSessionScreen({ width: 120, height: 36 }, { backend: deferred.backend })

    await toggleDetails(screen)
    const read = deferred.read(0)
    await toggleDetails(screen)
    expect(read.signal?.aborted).toBe(true)

    read.resolve(detailsFor({ backend: 'tmux', id: 'alpha', title: 'alpha' }, 'late-window'))
    await screen.settle()
    await move(screen, 'ARROW_DOWN')

    const frame = await screen.frame()
    expect(frame).not.toContain('late-window')
    expect(frame).toContain('Toggle details')
    expect(deferred.reads).toHaveLength(1)
  })

  test('unmounting releases a pending read', async () => {
    const deferred = createDeferredBackend([workspace('alpha')])
    screen = await renderSessionScreen({ width: 120, height: 36 }, { backend: deferred.backend })

    await toggleDetails(screen)
    const read = deferred.read(0)
    const fixture = screen
    screen = undefined
    fixture.destroy()

    expect(read.signal?.aborted).toBe(true)
    expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
  })

  test('below 120 columns an open inspector reads nothing until the panel shows', async () => {
    const deferred = createDeferredBackend([workspace('alpha')])
    screen = await renderSessionScreen({ width: 80, height: 24 }, { backend: deferred.backend })

    await toggleDetails(screen)
    expect(deferred.reads).toHaveLength(0)

    await screen.resize(120, 36)
    await screen.settle()
    expect(deferred.reads.map(read => read.id)).toEqual(['alpha'])
  })
})
