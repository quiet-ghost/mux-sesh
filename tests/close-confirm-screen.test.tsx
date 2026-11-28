import { afterEach, expect, test } from 'bun:test'
import type { LiveWorkspace, MultiplexerBackend, WorkspaceRef } from '../src/multiplexer'
import { renderSessionScreen } from './fixtures/session-screen'
import {
  dangerRows,
  dangerRowText,
  listRow,
  selectedRows,
  selectedRowText,
} from './fixtures/selection'
import { noticeOf, statusLinesOf } from './fixtures/status-line'
import { unsupportedBackend } from './fixtures/fake-backend'

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

// Records every mutation; the list it serves can change between the first and second d.
function recordingBackend(initial: LiveWorkspace[]) {
  const state = { workspaces: initial }
  const closed: WorkspaceRef[] = []

  const backend: MultiplexerBackend = unsupportedBackend({
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
  })

  return { backend, closed, state }
}

const alpha = workspace('$1', 'alpha', { isActive: true, unitCount: 2 })
const beta = workspace('$2', 'beta', { agentStatus: 'idle' })
const gamma = workspace('$3', 'gamma', { agentStatus: 'done' })

// The footer row's hint text, without the version badge.
function footerRow(frame: string): string {
  const rows = frame.split('\n').filter(row => row.trim() !== '')

  return rows.at(-1) ?? ''
}

async function render(
  workspaces: LiveWorkspace[],
  extra: { keybindMode?: 'vim' | 'standard' } = {}
) {
  const recording = recordingBackend(workspaces)
  screen = await renderSessionScreen(
    { width: 120, height: 36 },
    { workspaces: [], backend: recording.backend, ...extra }
  )
  await screen.settle()

  return { ...recording, screen }
}

test('the first d tints the row and asks for a second d instead of opening a dialog', async () => {
  const { screen, closed } = await render([alpha, beta, gamma])
  await screen.pressKey('j')
  await screen.pressKey('d')

  const frame = await screen.frame()
  expect(frame).not.toContain('Close tmux session')
  expect(await dangerRowText(screen)).toMatch(listRow('○ beta .*d again to close$'))
  expect(await selectedRows(screen)).toEqual([])
  expect(footerRow(frame)).toMatch(/^ cancel esc\s+close d {2}v/)
  expect(closed).toEqual([])
})

test('a second d closes exactly that session and leaves the picker usable', async () => {
  const { screen, closed } = await render([alpha, beta, gamma])
  await screen.pressKey('j')
  await screen.pressKey('d')
  await screen.pressKey('d')
  await screen.settle()

  expect(closed).toEqual([{ backend: 'tmux', id: '$2', title: 'beta' }])

  const after = await screen.frame()
  expect(noticeOf(after)).toEqual({ kind: 'done', text: "Session 'beta' closed" })
  expect(await dangerRows(screen)).toEqual([])
  expect(after).toContain('gamma')

  // The next first d arms the newly selected row; it does not close it.
  await screen.pressKey('d')
  expect(await dangerRowText(screen)).toMatch(/d again to close$/)
  expect(closed).toHaveLength(1)
})

test('moving the cursor cancels the waiting close and still moves', async () => {
  const { screen, closed } = await render([alpha, beta, gamma])
  await screen.pressKey('j')
  await screen.pressKey('d')
  await screen.pressKey('j')

  expect(await dangerRows(screen)).toEqual([])
  expect(await selectedRowText(screen)).toMatch(listRow('○ gamma'))
  expect(footerRow(await screen.frame())).toContain('select enter  close d')

  // A d on the new row starts over: it arms that row and closes nothing.
  await screen.pressKey('d')
  await screen.settle()
  expect(closed).toEqual([])
  expect(await dangerRowText(screen)).toMatch(listRow('○ gamma .*d again to close$'))
})

test('esc only cancels the waiting close: it does not also leave the agents list', async () => {
  const busy = workspace('$4', 'opencode-api', { agentStatus: 'idle' })
  const { screen, closed } = await render([alpha, busy])
  await screen.pressKey('o')
  await screen.pressKey('d')
  expect(await dangerRowText(screen)).toMatch(/opencode-api .*d again to close$/)

  await screen.pressKey('ESCAPE')
  await screen.settle()
  expect(closed).toEqual([])
  expect(await dangerRows(screen)).toEqual([])
  expect(await screen.frame()).toContain('Agent Sessions')

  await screen.pressKey('ESCAPE')
  expect(await screen.frame()).not.toContain('Agent Sessions')
})

test('esc only cancels the waiting close: it does not also clear the standard search', async () => {
  const { screen, closed } = await render([alpha, beta, gamma], { keybindMode: 'standard' })
  await screen.typeText('bet')
  await screen.pressKey('x', { ctrl: true })
  await screen.pressKey('d')
  expect(await dangerRowText(screen)).toMatch(listRow('○ beta .*d again to close$'))

  await screen.pressKey('ESCAPE')
  await screen.settle()
  expect(closed).toEqual([])
  expect(await dangerRows(screen)).toEqual([])
  expect(await screen.frame()).toContain('bet')
})

test('marking a row cancels the waiting close; d then reviews the marked set', async () => {
  const { screen, closed } = await render([alpha, beta, gamma])
  await screen.pressKey('j')
  await screen.pressKey('d')
  await screen.pressKey('m')

  expect(await screen.frame()).toMatch(/^ \* ○ beta .*marked/m)
  expect(await screen.frame()).not.toContain('d again to close')

  await screen.pressKey('d')
  expect(await screen.frame()).toContain('Close 1 marked tmux session?')
  await screen.pressKey('ESCAPE')
  expect(closed).toEqual([])
})

test('typing into the search cancels the waiting close and the key still types', async () => {
  const { screen, closed } = await render([alpha, beta, gamma], { keybindMode: 'standard' })
  await screen.pressKey('x', { ctrl: true })
  await screen.pressKey('d')
  expect(await dangerRows(screen)).toHaveLength(1)

  await screen.typeText('g')
  await screen.settle()
  expect(await dangerRows(screen)).toEqual([])
  expect(await selectedRowText(screen)).toMatch(listRow('○ gamma'))
  expect(closed).toEqual([])
})

test('in vim mode, i cancels the waiting close and opens the search', async () => {
  const { screen, closed } = await render([alpha, beta, gamma])
  await screen.pressKey('j')
  await screen.pressKey('d')
  await screen.pressKey('i')
  await screen.typeText('d')
  await screen.settle()

  expect(closed).toEqual([])
  expect(await screen.frame()).not.toContain('d again to close')
})

test('a refresh that removes the waiting row cancels it; the next d only arms the new row', async () => {
  const { screen, closed, state } = await render([alpha, beta])
  await screen.pressKey('j')
  await screen.pressKey('d')

  state.workspaces = [alpha]
  await screen.refresh()
  expect(await dangerRows(screen)).toEqual([])
  expect(footerRow(await screen.frame())).not.toContain('cancel esc')

  await screen.pressKey('d')
  await screen.settle()
  expect(closed).toEqual([])
  expect(await dangerRowText(screen)).toMatch(listRow('● alpha .*d again to close$'))
})

test('a waiting session renamed before the second d is not closed', async () => {
  const { screen, closed, state } = await render([alpha, beta])
  await screen.pressKey('j')
  await screen.pressKey('d')

  state.workspaces = [alpha, { ...beta, title: 'beta-renamed' }]
  await screen.refresh()
  await screen.pressKey('d')
  await screen.settle()

  expect(closed).toEqual([])
  const after = noticeOf(await screen.frame())
  expect(after?.kind).toBe('warn')
  expect(after?.text).toContain("Did not close session 'beta'")
  expect(after?.text).toContain("renamed to 'beta-renamed'")
  expect(after?.text).toContain('Nothing was closed')
})

test('a waiting session that gained a window before the second d is not closed', async () => {
  const { screen, closed, state } = await render([alpha, beta])
  await screen.pressKey('j')
  await screen.pressKey('d')

  state.workspaces = [alpha, { ...beta, unitCount: 2 }]
  await screen.refresh()
  await screen.pressKey('d')
  await screen.settle()

  expect(closed).toEqual([])
  const notice = noticeOf(await screen.frame())
  expect(notice?.kind).toBe('warn')
  expect(notice?.text).toContain('now has 2 windows')
})

test('a list that reorders under a waiting close never closes another row', async () => {
  const { screen, closed, state } = await render([alpha, beta])
  await screen.pressKey('j')
  await screen.pressKey('d')

  // A new session lands where the cursor was; the close must not follow the cursor to it.
  state.workspaces = [alpha, workspace('$9', 'aardvark'), beta]
  await screen.refresh()
  await screen.pressKey('d')
  await screen.settle()

  expect(closed.filter(ref => ref.id !== '$2')).toEqual([])
})

test('while it waits, the warnings the review gave show as a warn status line', async () => {
  const busy = workspace('$4', 'opencode-api', { isActive: true, agentStatus: 'working' })
  const { screen } = await render([busy])
  await screen.pressKey('o')
  await screen.pressKey('d')

  const frame = await screen.frame()
  expect(statusLinesOf(frame)).toEqual([
    {
      kind: 'warn',
      text: "Attached: a client is using it now. Agent working in 'opencode-api'",
    },
  ])
  expect(footerRow(frame)).toMatch(/^ cancel esc\s+close d {2}v/)

  await screen.pressKey('ESCAPE')
  expect(statusLinesOf(await screen.frame())).toEqual([])
})

test('a waiting close without warnings adds no status line', async () => {
  const { screen } = await render([alpha, beta])
  await screen.pressKey('j')
  await screen.pressKey('d')

  expect(statusLinesOf(await screen.frame())).toEqual([])
})

test('in standard mode, the prefix chord arms and confirms, and so does a bare second d', async () => {
  const { screen, closed } = await render([alpha, beta, gamma], { keybindMode: 'standard' })
  await screen.pressKey('ARROW_DOWN')
  await screen.pressKey('x', { ctrl: true })
  await screen.pressKey('d')
  await screen.pressKey('x', { ctrl: true })
  await screen.pressKey('d')
  await screen.settle()

  expect(closed).toEqual([{ backend: 'tmux', id: '$2', title: 'beta' }])

  await screen.pressKey('x', { ctrl: true })
  await screen.pressKey('d')
  await screen.pressKey('d')
  await screen.settle()

  expect(closed).toHaveLength(2)
  // Neither d reached the search field.
  expect(await screen.frame()).toContain('Type to search...')
})

test('the command palette close arms the row like d does', async () => {
  const { screen, closed } = await render([alpha, beta, gamma])
  await screen.pressKey('j')
  await screen.pressKey('p', { ctrl: true })
  await screen.typeText('close session')
  await screen.pressKey('RETURN')
  await screen.settle()

  expect(closed).toEqual([])
  expect(await dangerRowText(screen)).toMatch(listRow('○ beta .*d again to close$'))

  await screen.pressKey('d')
  await screen.settle()
  expect(closed).toEqual([{ backend: 'tmux', id: '$2', title: 'beta' }])
})

test('one marked row still gets the batch review, with its long path kept at both ends', async () => {
  const deep = workspace('$4', 'deep', {
    path: '/fixture/worktrees/projects/an-extremely-long-parent-directory/deep',
  })

  const { screen } = await render([alpha, deep])
  await screen.resize(60, 24)
  await screen.pressKey('j')
  await screen.pressKey('m')
  await screen.pressKey('d')

  const frame = await screen.frame()
  expect(frame).toContain('Close 1 marked tmux session?')
  expect(frame).toMatch(/deep +\/fixture\/.*….*\/deep +1 window/)
  expect(frame).not.toContain('d again to close')
})
