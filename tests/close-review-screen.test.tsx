import { afterEach, expect, test } from 'bun:test'
import type { LiveWorkspace, MultiplexerBackend, WorkspaceRef } from '../src/multiplexer'
import { renderSessionScreen } from './fixtures/session-screen'
import { readToast } from './fixtures/toast'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.defects).toEqual([])
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

function workspace(id: string, title: string, extra: Partial<LiveWorkspace> = {}): LiveWorkspace {
  return {
    backend: 'tmux',
    id,
    title,
    path: `/fixture/${title}`,
    isActive: false,
    unitCount: 1,
    ...extra,
  }
}

function unsupported(): never {
  throw new Error('The close-review backend does not implement that operation')
}

// Records every mutation; the list it serves can change between review and confirm.
function recordingBackend(initial: LiveWorkspace[]) {
  const state = { workspaces: initial }
  const closed: WorkspaceRef[] = []

  const backend: MultiplexerBackend = {
    kind: 'tmux',
    capabilities: { previousWorkspace: true },
    async list() {
      return state.workspaces
    },
    async details(target) {
      return { workspace: target, isActive: false, unitLabel: 'Windows', units: [], agents: [] }
    },
    async open() {
      return { kind: 'focused' }
    },
    async current() {
      return undefined
    },
    async close(target) {
      closed.push(target)
      state.workspaces = state.workspaces.filter(entry => entry.id !== target.id)
    },
    openOrCreate: unsupported,
    create: unsupported,
    start: unsupported,
    rename: unsupported,
    directory: unsupported,
    openEditor: unsupported,
  }

  return { backend, closed, state }
}

const alpha = workspace('$1', 'alpha', { isActive: true, unitCount: 2 })
const beta = workspace('$2', 'beta', { agentStatus: 'idle' })
const gamma = workspace('$3', 'gamma', { agentStatus: 'done' })

test('a detached idle session is only reviewed: d twice closes nothing and Esc leaves it open', async () => {
  const { backend, closed } = recordingBackend([alpha, beta, gamma])
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()
  await screen.pressKey('j')
  await screen.pressKey('d')

  const review = await screen.frame()
  expect(review).toContain("Close tmux session 'beta'?")
  expect(review).toContain('/fixture/beta')
  expect(review).toContain('Closes 1 window')
  expect(review).toContain('No files, worktrees or branches are deleted')
  expect(review).toContain('close enter  keep esc')
  expect(review).not.toContain('Attached')

  await screen.pressKey('d')
  await screen.settle()
  expect(closed).toEqual([])

  await screen.pressKey('ESCAPE')
  await screen.settle()
  expect(closed).toEqual([])
  expect(await screen.frame()).not.toContain('Close tmux session')
})

test('confirming the review closes exactly the reviewed session and leaves the picker usable', async () => {
  const { backend, closed } = recordingBackend([alpha, beta, gamma])
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()
  await screen.pressKey('j')
  await screen.pressKey('d')
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(closed).toEqual([{ backend: 'tmux', id: '$2', title: 'beta' }])

  const after = await screen.frame()
  expect(after).toContain("Session 'beta' closed")
  expect(after).not.toContain('Close tmux session')
  expect(after).toContain('gamma')

  // The picker keeps working: the next review targets the newly selected row.
  await screen.pressKey('d')
  expect(await screen.frame()).toContain("Close tmux session '")
  await screen.pressKey('ESCAPE')
  expect(closed).toHaveLength(1)
})

test('the review warns about an attached session with a working agent', async () => {
  const busy = workspace('$4', 'opencode-api', { isActive: true, agentStatus: 'working' })
  const { backend } = recordingBackend([busy])
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()
  await screen.pressKey('o')
  await screen.pressKey('d')

  const review = await screen.frame()
  expect(review).toContain("Close tmux session 'opencode-api'?")
  expect(review).toContain('Attached: a client is using it now')
  expect(review).toContain("Agent working in 'opencode-api'")
})

test('a reviewed session renamed before confirm is not closed', async () => {
  const { backend, closed, state } = recordingBackend([alpha, beta])
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()
  await screen.pressKey('j')
  await screen.pressKey('d')

  state.workspaces = [alpha, { ...beta, title: 'beta-renamed' }]
  await screen.refresh()
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(closed).toEqual([])
  const after = readToast(await screen.frame())
  expect(after).toContain("Did not close session 'beta'")
  expect(after).toContain("renamed to 'beta-renamed'")
  expect(after).toContain('Nothing was closed')
})

test('a reviewed session that gained a window before confirm is not closed', async () => {
  const { backend, closed, state } = recordingBackend([alpha, beta])
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()
  await screen.pressKey('j')
  await screen.pressKey('d')

  state.workspaces = [alpha, { ...beta, unitCount: 2 }]
  await screen.refresh()
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(closed).toEqual([])
  expect(readToast(await screen.frame())).toContain('now has 2 windows')
})

test('a list that reorders under the review still closes only the reviewed ref', async () => {
  const { backend, closed, state } = recordingBackend([alpha, beta])
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()
  await screen.pressKey('j')
  await screen.pressKey('d')

  // A new session lands where the cursor was; the confirmed target must not follow the cursor.
  state.workspaces = [alpha, workspace('$9', 'aardvark'), beta]
  await screen.refresh()
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(closed).toEqual([{ backend: 'tmux', id: '$2', title: 'beta' }])
})

test('a reviewed session that vanished before confirm is not replaced by another', async () => {
  const { backend, closed, state } = recordingBackend([alpha, beta])
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()
  await screen.pressKey('j')
  await screen.pressKey('d')

  state.workspaces = [alpha]
  await screen.refresh()
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(closed).toEqual([])
  expect(readToast(await screen.frame())).toContain("'beta' is no longer listed")
})

test('a long path keeps its start and end in the single and batch reviews', async () => {
  const deep = workspace('$4', 'deep', {
    path: '/fixture/worktrees/projects/an-extremely-long-parent-directory/deep',
  })

  const { backend } = recordingBackend([alpha, deep])
  screen = await renderSessionScreen({ width: 60, height: 24 }, { workspaces: [], backend })
  await screen.settle()
  await screen.pressKey('j')
  await screen.pressKey('d')

  const single = await screen.frame()
  expect(single).toMatch(/\/fixture\/.*….*\/deep/)
  await screen.pressKey('ESCAPE')

  await screen.pressKey('m')
  await screen.pressKey('k')
  await screen.pressKey('m')
  await screen.pressKey('d')

  expect(await screen.frame()).toMatch(/'deep' {2}\/fixture\/.*….*\/deep {2}/)
})
