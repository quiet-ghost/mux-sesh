import { afterEach, describe, expect, test } from 'bun:test'
import type { LiveWorkspace } from '../src/multiplexer'
import { renderSessionScreen } from './fixtures/session-screen'
import { listRow, selectedRowText, type SelectionScreen } from './fixtures/selection'

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

function lineIndex(frame: string, pattern: RegExp): number {
  return lines(frame).findIndex(line => pattern.test(line))
}

async function expectViewport(fixture: SelectionScreen, height: number): Promise<void> {
  const frame = await fixture.frame()
  const rows = lines(frame)
  const header = lineIndex(frame, /mux-sesh/)
  const sessions = lineIndex(frame, /^\s*Live(\s\s|\s*$)/)
  const agents = lineIndex(frame, /^\s*Agents(\s\s|\s*$)/)
  const footer = lineIndex(frame, /^ .*(select enter|back esc)/)
  const lastRow = rows.findLastIndex(line => /[●○] /.test(line))

  expect(rows).toHaveLength(height)
  expect(header).toBeGreaterThanOrEqual(0)
  expect(sessions).toBeGreaterThan(header)
  expect(agents).toBeGreaterThan(sessions)
  expect(lastRow).toBeGreaterThan(agents)
  expect(footer).toBeGreaterThan(lastRow)
  expect(rows[footer]).not.toMatch(/[●○]/)
  // Exactly one row is highlighted.
  await selectedRowText(fixture)
}

async function expectNoWrappedContinuation(fixture: SelectionScreen): Promise<void> {
  const rows = lines(await fixture.frame())
  const row = await selectedRowText(fixture)
  const selected = rows.findIndex(line => line.includes(row))

  expect(selected).toBeGreaterThanOrEqual(0)

  expect(rows[selected + 1]).not.toMatch(/^\s{2,3}[a-z]/)
}

async function press(key: string, times: number): Promise<void> {
  for (let count = 0; count < times; count++) await screen?.pressKey(key)
}

describe('responsive session viewport', () => {
  test.each(SIZES)('fits header, sections, and footer at $width x $height', async dimensions => {
    screen = await renderSessionScreen(dimensions, { workspaces })

    await expectViewport(screen, dimensions.height)
    expect(await selectedRowText(screen)).toMatch(listRow('.*session-00'))
  })

  test.each(SIZES)(
    'keeps one visible selection moving into Agents and back at $width x $height',
    async dimensions => {
      screen = await renderSessionScreen(dimensions, { workspaces })

      await screen.pressKey('o')
      await expectViewport(screen, dimensions.height)
      expect(await selectedRowText(screen)).toMatch(listRow('.*agent-one'))

      await screen.pressKey('ARROW_DOWN')
      expect(await selectedRowText(screen)).toMatch(listRow('.*agent-two'))

      await screen.pressKey('ESCAPE')
      await expectViewport(screen, dimensions.height)
      expect(await selectedRowText(screen)).toMatch(listRow('.*session-00'))
    }
  )

  test('keeps a selected session near the bottom visible after shrinking', async () => {
    screen = await renderSessionScreen({ width: 120, height: 36 }, { workspaces })
    await press('ARROW_DOWN', 29)
    expect(await selectedRowText(screen)).toMatch(listRow('.*session-29'))

    await screen.resize(60, 18)

    await expectViewport(screen, 18)
    expect(await selectedRowText(screen)).toMatch(listRow('.*session-29'))
  })

  test.each(SIZES)(
    'truncates long names with an ellipsis at $width x $height',
    async dimensions => {
      screen = await renderSessionScreen(dimensions, { workspaces })
      await press('ARROW_DOWN', 30)

      const sessions = await screen.frame()
      await expectViewport(screen, dimensions.height)
      const sessionRow = await selectedRowText(screen)
      expect(sessionRow).toContain('session-with-an')
      expect(sessionRow).toContain('…')
      expect(sessions).not.toContain(LONG_SESSION)
      await expectNoWrappedContinuation(screen)

      await screen.pressKey('o')
      await press('ARROW_DOWN', 2)

      await expectViewport(screen, dimensions.height)
      const agentRow = await selectedRowText(screen)
      expect(agentRow).toContain('agent-with-an')
      expect(agentRow).toContain('…')
      await expectNoWrappedContinuation(screen)
    }
  )

  test('shows agent workspace context and keeps the list full width below 120 columns', async () => {
    screen = await renderSessionScreen({ width: 80, height: 24 }, { workspaces })
    await screen.pressKey('o')

    expect(await selectedRowText(screen)).toMatch(listRow('.*agent-one .*session-03'))
    expect(screen.calls).toEqual([{ operation: 'list' }])
  })
})
