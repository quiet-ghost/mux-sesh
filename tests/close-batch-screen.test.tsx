import { afterEach, expect, test } from 'bun:test'
import { CommandTimeoutError } from '../src/multiplexer/command'
import { MultiplexerError } from '../src/multiplexer/types'
import type { LiveWorkspace, MultiplexerBackend, WorkspaceRef } from '../src/multiplexer'
import { footerHints } from './fixtures/footer'
import { withoutSideBorders } from './fixtures/pane'
import { renderSessionScreen } from './fixtures/session-screen'

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
  throw new Error('The close-batch backend does not implement that operation')
}

// How the fake backend answers a close of one id; anything unscripted closes cleanly.
type CloseScript =
  | { readonly kind: 'fail'; readonly message: string }
  | { readonly kind: 'timeout'; readonly happened: boolean }

interface BackendOptions {
  readonly kind?: 'tmux' | 'herdr'
  readonly current?: WorkspaceRef
}

// Records every mutation; scripts per-id failures and whether an unfinished close really happened.
function recordingBackend(initial: LiveWorkspace[], options: BackendOptions = {}) {
  const state = { workspaces: initial }
  const closed: WorkspaceRef[] = []
  const opened: string[] = []
  const scripts = new Map<string, CloseScript>()

  const backend: MultiplexerBackend = {
    kind: options.kind ?? 'tmux',
    capabilities: { previousWorkspace: true },
    async list() {
      return state.workspaces
    },
    async details(target) {
      return { workspace: target, isActive: false, unitLabel: 'Windows', units: [], agents: [] }
    },
    async open(target) {
      opened.push(target.id)

      return { kind: 'focused' }
    },
    async current() {
      return options.current
    },
    async close(target) {
      closed.push(target)
      const script = scripts.get(target.id)
      scripts.delete(target.id)

      if (script?.kind === 'fail') throw new MultiplexerError('command-failed', script.message)

      if (script?.kind === 'timeout') {
        if (script.happened) {
          state.workspaces = state.workspaces.filter(entry => entry.id !== target.id)
        }

        throw new CommandTimeoutError({ executable: 'tmux', timeoutMs: 5000 })
      }

      state.workspaces = state.workspaces.filter(entry => entry.id !== target.id)
    },
    openOrCreate: unsupported,
    create: unsupported,
    start: unsupported,
    rename: unsupported,
    directory: unsupported,
    openEditor: unsupported,
  }

  return { backend, closed, opened, state, scripts }
}

function flat(frame: string): string {
  return withoutSideBorders(frame).replace(/\s+/g, ' ')
}

function ids(refs: readonly WorkspaceRef[]): string[] {
  return refs.map(ref => ref.id)
}

const alpha = workspace('$1', 'alpha', { isActive: true, unitCount: 2 })
const beta = workspace('$2', 'beta', { agentStatus: 'working' })
const charlie = workspace('$3', 'charlie', { agentStatus: 'done' })
const delta = workspace('$4', 'delta', { agentStatus: 'idle' })

test('marked rows are visible and d reviews exactly the marked set, not the cursor row', async () => {
  const { backend, closed } = recordingBackend([alpha, beta, charlie, delta])
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()

  // No row is ever marked for the user: marks come only from m.
  expect(await screen.frame()).not.toContain('marked')

  await screen.pressKey('j')
  await screen.pressKey('m')
  await screen.pressKey('j')
  await screen.pressKey('j')
  await screen.pressKey('m')
  await screen.pressKey('k')

  const list = await screen.frame()
  expect(list).toMatch(/\* ○ beta/)
  expect(list).toMatch(/\* ○ delta/)
  expect(list).not.toMatch(/\* ○ charlie/)
  expect(footerHints(list)).toContain('close 2 marked d')

  await screen.pressKey('d')
  const review = flat(await screen.frame())
  expect(review).toContain('Close 2 marked tmux sessions?')
  expect(review).toContain("'beta' /fixture/beta 1 window")
  expect(review).toContain("Agent working in 'beta'")
  expect(review).toContain("'delta' /fixture/delta 1 window")
  expect(review).not.toContain("'charlie'")
  expect(review).toContain('No files, worktrees or branches are deleted')
  expect(review).toContain('close 2 enter keep esc')

  await screen.pressKey('RETURN')
  await screen.settle()

  expect(ids(closed)).toEqual(['$2', '$4'])
  const after = flat(await screen.frame())
  expect(after).toContain("Closed 2 sessions: 'beta', 'delta'")
  expect(after).toContain('charlie')
  expect(after).not.toContain('marked')
})

test('m unmarks a marked row, so it is not reviewed', async () => {
  const { backend, closed } = recordingBackend([alpha, beta, charlie])
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()
  await screen.pressKey('j')
  await screen.pressKey('m')
  await screen.pressKey('j')
  await screen.pressKey('m')
  await screen.pressKey('k')
  await screen.pressKey('m')

  expect(footerHints(await screen.frame())).toContain('close 1 marked d')
  await screen.pressKey('d')
  const review = flat(await screen.frame())
  expect(review).toContain('Close 1 marked tmux session?')
  expect(review).not.toContain("'beta'")

  await screen.pressKey('ESCAPE')
  expect(closed).toEqual([])
  // Keeping the review keeps the marks.
  expect(await screen.frame()).toMatch(/\* ○ charlie/)
})

test('a partial failure reports each reviewed target and never touches unreviewed ones', async () => {
  const { backend, closed, scripts } = recordingBackend([alpha, beta, charlie, delta])
  scripts.set('$3', { kind: 'fail', message: "can't find session: charlie" })
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()

  for (const step of ['j', 'm', 'j', 'm', 'j', 'm']) await screen.pressKey(step)
  await screen.pressKey('d')
  await screen.pressKey('RETURN')
  await screen.settle()

  // alpha was never marked: it is not reviewed, attempted or reported.
  expect(ids(closed)).toEqual(['$2', '$3', '$4'])
  const receipt = flat(await screen.frame())
  expect(receipt).toContain('Closed 2 of 3 marked sessions')
  expect(receipt).toContain("✓ Closed session 'beta'")
  expect(receipt).toContain("✗ Could not close session 'charlie': can't find session: charlie")
  expect(receipt).toContain("✓ Closed session 'delta'")
  expect(receipt).not.toContain("'alpha'")
  expect(receipt).toContain('No files, worktrees or branches were deleted')
  expect(receipt).toContain('retry 1 enter close esc')
})

test('retry reconciles an unfinished close first and never repeats a completed one', async () => {
  const { backend, closed, scripts } = recordingBackend([alpha, beta, charlie, delta])
  // beta fails, charlie times out but really closed, so delta is not attempted after it.
  scripts.set('$2', { kind: 'fail', message: 'server busy' })
  scripts.set('$3', { kind: 'timeout', happened: true })
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()

  for (const step of ['m', 'j', 'm', 'j', 'm', 'j', 'm']) await screen.pressKey(step)
  // alpha hosts nothing here (current is unknown to the picker), so it is closable.
  await screen.pressKey('d')
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(ids(closed)).toEqual(['$1', '$2', '$3'])
  const first = flat(await screen.frame())
  expect(first).toContain("✓ Closed session 'alpha'")
  expect(first).toContain("✗ Could not close session 'beta': server busy")
  // The list refresh after the run shows charlie gone, so its unfinished close is reconciled.
  expect(first).toContain("✓ Closed session 'charlie' (confirmed by refresh)")
  expect(first).toContain("· Not attempted: session 'delta'")
  expect(first).toContain('retry 2 enter close esc')

  await screen.pressKey('RETURN')
  await screen.settle()

  // Only the known-failed and unattempted targets are closed again.
  expect(ids(closed)).toEqual(['$1', '$2', '$3', '$2', '$4'])
  expect(flat(await screen.frame())).toContain(
    "Closed 4 sessions: 'alpha', 'beta', 'charlie', 'delta'"
  )
})

test('an unfinished close still listed after refresh stays unknown until a retry reconciles it', async () => {
  const { backend, closed, scripts, state } = recordingBackend([alpha, beta, charlie])
  scripts.set('$2', { kind: 'timeout', happened: false })
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()

  for (const step of ['j', 'm', 'j', 'm']) await screen.pressKey(step)
  await screen.pressKey('d')
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(ids(closed)).toEqual(['$2'])
  const first = flat(await screen.frame())
  expect(first).toContain("? Closing session 'beta' did not finish")
  expect(first).toContain("· Not attempted: session 'charlie'")

  // Meanwhile beta finished closing on its own; the retry must see that before mutating.
  state.workspaces = state.workspaces.filter(entry => entry.id !== '$2')
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(ids(closed)).toEqual(['$2', '$3'])
  expect(flat(await screen.frame())).toContain("Closed 2 sessions: 'beta', 'charlie'")
})

test('the session hosting the picker is refused in a batch and the rest still close', async () => {
  const { backend, closed } = recordingBackend([alpha, beta, charlie], {
    current: { backend: 'tmux', id: '$1', title: 'alpha' },
  })

  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()

  for (const step of ['m', 'j', 'm']) await screen.pressKey(step)
  await screen.pressKey('d')

  const review = flat(await screen.frame())
  expect(review).toContain('Close 1 marked tmux session?')
  expect(review).toContain("✗ Not closing 'alpha': it hosts this picker")
  expect(review).toContain("'beta' /fixture/beta")

  await screen.pressKey('RETURN')
  await screen.settle()

  expect(ids(closed)).toEqual(['$2'])
  const receipt = flat(await screen.frame())
  expect(receipt).toContain("✓ Closed session 'beta'")
  expect(receipt).toContain("✗ Not closing 'alpha': it hosts this picker")
})

test('a marked Herdr agent pane is refused and its workspace stays open', async () => {
  const panes: LiveWorkspace[] = [
    workspace('w1', 'plain', { backend: 'herdr' }),
    workspace('w2', 'agent-one', {
      backend: 'herdr',
      agentStatus: 'working',
      target: { kind: 'agent', tabId: 'w2:t1', paneId: 'w2:p1' },
    }),
  ]

  const { backend, closed } = recordingBackend(panes, { kind: 'herdr' })
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()

  await screen.pressKey('m')
  await screen.pressKey('o')
  await screen.pressKey('m')
  expect(footerHints(await screen.frame())).toContain('close 2 marked d')
  await screen.pressKey('d')

  const review = flat(await screen.frame())
  expect(review).toContain('Close 1 marked Herdr workspace?')
  expect(review).toContain("✗ Not closing 'agent-one'")
  expect(review).toContain('closes only whole workspaces')

  await screen.pressKey('RETURN')
  await screen.settle()

  // Only the plainly marked workspace closes; the pane's linked workspace is untouched.
  expect(ids(closed)).toEqual(['w1'])
})

test('a list refresh after review cannot add a target to the confirmed set', async () => {
  const { backend, closed, state } = recordingBackend([alpha, beta])
  screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces: [], backend })
  await screen.settle()
  await screen.pressKey('j')
  await screen.pressKey('m')
  await screen.pressKey('d')

  state.workspaces = [alpha, workspace('$9', 'aardvark'), beta]
  await screen.refresh()
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(ids(closed)).toEqual(['$2'])
})

test('standard keys mark and review through the prefix', async () => {
  const { backend, closed } = recordingBackend([alpha, beta, charlie])
  screen = await renderSessionScreen(
    { width: 120, height: 36 },
    { workspaces: [], backend, keybindMode: 'standard' }
  )
  await screen.settle()

  await screen.pressKey('ARROW_DOWN')
  await screen.pressKey('x', { ctrl: true })
  await screen.pressKey('m')
  await screen.pressKey('ARROW_DOWN')
  await screen.pressKey('x', { ctrl: true })
  await screen.pressKey('m')
  await screen.pressKey('x', { ctrl: true })
  await screen.pressKey('d')

  expect(flat(await screen.frame())).toContain('Close 2 marked tmux sessions?')
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(ids(closed)).toEqual(['$2', '$3'])
})
