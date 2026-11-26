import { afterEach, describe, expect, test } from 'bun:test'
import type { LiveWorkspace } from '../src/multiplexer'
import { renderSessionScreen } from './fixtures/session-screen'

const LONG_SESSION = 'session-with-an-extremely-long-workspace-name-that-must-not-wrap-in-the-list'
const LONG_AGENT = 'agent-with-an-extremely-long-pane-name-that-must-truncate-instead-of-wrapping'

function workspace(index: number): LiveWorkspace {
  const title = `session-${String(index).padStart(2, '0')}`

  return {
    backend: 'herdr',
    id: title,
    title,
    path: `/fixture/projects/${title}`,
    isActive: index === 0,
    unitCount: 1,
  }
}

function agent(title: string, workspaceId: string, tabId: string, paneId: string): LiveWorkspace {
  return {
    backend: 'herdr',
    id: workspaceId,
    title,
    workspaceTitle: workspaceId,
    path: `/fixture/projects/${workspaceId}`,
    isActive: false,
    unitCount: 1,
    agentStatus: 'working',
    target: { kind: 'agent', tabId, paneId },
  }
}

const workspaces: LiveWorkspace[] = [
  ...Array.from({ length: 30 }, (_, index) => workspace(index)),
  {
    backend: 'herdr',
    id: 'long',
    title: LONG_SESSION,
    path: '/fixture/an-extremely-long-parent-directory-name-for-the-path-tail/zz-long',
    isActive: false,
    unitCount: 1,
  },
  agent('agent-one', 'session-03', 'session-03:t1', 'session-03:p1'),
  agent('agent-two', 'session-03', 'session-03:t1', 'session-03:p2'),
  agent(LONG_AGENT, 'session-07', 'session-07:t1', 'session-07:p1'),
]

const SIZES = [
  { width: 60, height: 18 },
  { width: 80, height: 24 },
  { width: 120, height: 36 },
]

let screen: Awaited<ReturnType<typeof renderSessionScreen>> | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

function lines(frame: string): string[] {
  return frame.split('\n').slice(0, -1)
}

function selectedLines(frame: string): string[] {
  return lines(frame).filter(line => line.includes('›'))
}

function lineIndex(frame: string, pattern: RegExp): number {
  return lines(frame).findIndex(line => pattern.test(line))
}

function expectViewport(frame: string, height: number): void {
  const rows = lines(frame)
  const header = lineIndex(frame, /mux-sesh/)
  const sessions = lineIndex(frame, /^\s*H Live(\s\s|\s*$)/)
  const agents = lineIndex(frame, /^\s*A Agents(\s\s|\s*$)/)
  const footer = lineIndex(frame, /^ (enter select|esc back) /)
  const lastRow = rows.findLastIndex(line => /[●○] /.test(line))

  expect(rows).toHaveLength(height)
  expect(header).toBeGreaterThanOrEqual(0)
  expect(sessions).toBeGreaterThan(header)
  expect(agents).toBeGreaterThan(sessions)
  expect(lastRow).toBeGreaterThan(agents)
  expect(footer).toBeGreaterThan(lastRow)
  expect(rows[footer]).not.toMatch(/[●○]/)
  expect(selectedLines(frame)).toHaveLength(1)
}

function expectNoWrappedContinuation(frame: string): void {
  const rows = lines(frame)
  const selected = rows.findIndex(line => line.includes('›'))

  expect(rows[selected + 1]).not.toMatch(/^\s{2,3}[a-z]/)
}

async function press(key: string, times: number): Promise<void> {
  for (let count = 0; count < times; count++) await screen?.pressKey(key)
}

describe('responsive session viewport', () => {
  test.each(SIZES)('fits header, sections, and footer at $width x $height', async dimensions => {
    screen = await renderSessionScreen(dimensions, { workspaces })

    const frame = await screen.frame()
    expectViewport(frame, dimensions.height)
    expect(selectedLines(frame)[0]).toMatch(/› .*session-00/)
  })

  test.each(SIZES)(
    'keeps one visible selection moving into Agents and back at $width x $height',
    async dimensions => {
      screen = await renderSessionScreen(dimensions, { workspaces })

      await screen.pressKey('o')
      const agents = await screen.frame()
      expectViewport(agents, dimensions.height)
      expect(selectedLines(agents)[0]).toMatch(/› .*agent-one/)

      await screen.pressKey('ARROW_DOWN')
      expect(selectedLines(await screen.frame())[0]).toMatch(/› .*agent-two/)

      await screen.pressKey('ESCAPE')
      const sessions = await screen.frame()
      expectViewport(sessions, dimensions.height)
      expect(selectedLines(sessions)[0]).toMatch(/› .*session-00/)
    }
  )

  test('keeps a selected session near the bottom visible after shrinking', async () => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces })
    await press('ARROW_DOWN', 29)
    expect(selectedLines(await screen.frame())[0]).toMatch(/› .*session-29/)

    await screen.resize(60, 18)

    const frame = await screen.frame()
    expectViewport(frame, 18)
    expect(selectedLines(frame)[0]).toMatch(/› .*session-29/)
  })

  test.each(SIZES)(
    'truncates long names with an ellipsis at $width x $height',
    async dimensions => {
      screen = await renderSessionScreen(dimensions, { workspaces })
      await press('ARROW_DOWN', 30)

      const sessions = await screen.frame()
      expectViewport(sessions, dimensions.height)
      const sessionRow = selectedLines(sessions)[0] ?? ''
      expect(sessionRow).toContain('session-with-an')
      expect(sessionRow).toContain('…')
      expect(sessions).not.toContain(LONG_SESSION)
      expectNoWrappedContinuation(sessions)

      await screen.pressKey('o')
      await press('ARROW_DOWN', 2)

      const agents = await screen.frame()
      expectViewport(agents, dimensions.height)
      const agentRow = selectedLines(agents)[0] ?? ''
      expect(agentRow).toContain('agent-with-an')
      expect(agentRow).toContain('…')
      expectNoWrappedContinuation(agents)
    }
  )

  test('shows agent workspace context and keeps the list full width below 120 columns', async () => {
    screen = await renderSessionScreen({ width: 80, height: 24 }, { workspaces })
    await screen.pressKey('o')

    const frame = await screen.frame()
    expect(selectedLines(frame)[0]).toMatch(/› .*agent-one .*session-03/)
    expect(screen.calls).toEqual([{ operation: 'list' }])
  })
})
