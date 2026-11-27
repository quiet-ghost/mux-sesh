import { afterEach, describe, expect, jest, test } from 'bun:test'
import { RGBA } from '@opentui/core'
import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'
import { TOAST_DURATION_MS } from '../src/app/notifications'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError } from '../src/multiplexer/types'
import { resolveTheme, ThemeProvider } from '../src/styles/theme'
import type { ThemeColors } from '../src/types'
import Footer from '../src/ui/Footer'
import { fitStatusText, STATUS_LINE_MAX_ROWS } from '../src/ui/status-line'
import { readFooter } from './fixtures/footer'
import { renderSessionScreen } from './fixtures/session-screen'
import { noticeOf, readNotice, statusLinesOf, statusWordColor } from './fixtures/status-line'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
  jest.useRealTimers()
  const fixture = screen
  screen = undefined

  if (!fixture) return
  fixture.destroy()
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
})

const colors: ThemeColors = resolveTheme('catppuccin', {}, 'dark').colors

const agentWorkspaces: LiveWorkspace[] = [
  {
    backend: 'herdr',
    id: 'agents',
    title: 'agent-one',
    path: '/fixture/one',
    isActive: false,
    unitCount: 1,
    agentStatus: 'working',
    target: { kind: 'agent', tabId: 'agents:t1', paneId: 'agents:p1' },
  },
]

const LONG_FAILURE = "tmux could not switch to 'web-frontend': no current client"

function unsupported(): never {
  throw new Error('The status-line fixture backend does not implement that operation')
}

// Opening fails with an expected error, so Enter reports instead of exiting the test.
function failingOpenBackend(message = 'the fixture has no attached client'): MultiplexerBackend {
  return {
    kind: 'tmux',
    capabilities: { previousWorkspace: false },
    async list() {
      return [
        {
          backend: 'tmux',
          id: 'alpha',
          title: 'alpha',
          path: '/fixture/alpha',
          isActive: false,
          unitCount: 1,
        },
      ]
    },
    async details(workspace) {
      return { workspace, isActive: false, unitLabel: 'Windows', units: [], agents: [] }
    },
    async open() {
      throw new MultiplexerError('command-failed', message)
    },
    openOrCreate: unsupported,
    create: unsupported,
    start: unsupported,
    rename: unsupported,
    close: unsupported,
    current: unsupported,
    directory: unsupported,
    openEditor: unsupported,
  }
}

// Each list() answers with the latest scripted rows or failure.
function scriptedBackend(initial: LiveWorkspace[]) {
  let next = async (): Promise<LiveWorkspace[]> => initial

  const backend: MultiplexerBackend = {
    kind: 'tmux',
    capabilities: { previousWorkspace: false },
    async list() {
      return next()
    },
    async details(workspace) {
      return { workspace, isActive: false, unitLabel: 'Windows', units: [], agents: [] }
    },
    open: unsupported,
    openOrCreate: unsupported,
    create: unsupported,
    start: unsupported,
    rename: unsupported,
    close: unsupported,
    current: unsupported,
    directory: unsupported,
    openEditor: unsupported,
  }

  return {
    backend,
    respond(rows: LiveWorkspace[]) {
      next = async () => rows
    },
    fail(error: Error) {
      next = async () => {
        throw error
      }
    },
  }
}

function tmuxWorkspace(title: string): LiveWorkspace {
  return {
    backend: 'tmux',
    id: title,
    title,
    path: `/fixture/${title}`,
    isActive: false,
    unitCount: 1,
  }
}

function hex(color: string): ReturnType<RGBA['toInts']> {
  return RGBA.fromHex(color).toInts()
}

function wordColor(
  fixture: { captureSpans: Screen['captureSpans'] },
  word: Parameters<typeof statusWordColor>[1]
): number[] | undefined {
  return statusWordColor(fixture.captureSpans().lines, word)
}

function rowsOf(frame: string): string[] {
  return frame.split('\n').filter(row => row.trim() !== '')
}

// Fake timers also stop `Bun.sleep`, so a faked test settles on microtasks alone.
async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 50; tick++) await Promise.resolve()
  })
}

async function refresh(
  fixture: Screen,
  settle: () => Promise<void> = () => fixture.settle()
): Promise<void> {
  await fixture.pressKey('x', { ctrl: true })
  await fixture.pressKey('R', { shift: true })
  await settle()
}

function advance(milliseconds: number): void {
  act(() => {
    jest.advanceTimersByTime(milliseconds)
  })
}

describe('notices in the status line', () => {
  test('a refresh shows `done  Refreshed` in the footer row, then the hints return', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 })
    const before = readFooter(await screen.frame())
    jest.useFakeTimers()

    await refresh(screen, flush)
    const frame = await screen.frame()

    expect(readNotice(frame)).toEqual({
      kind: 'done',
      text: 'Refreshed',
      more: 0,
      dismiss: false,
      rows: 1,
    })
    expect(wordColor(screen, 'done')).toEqual(hex(colors.active))
    expect(readFooter(frame).version).toBe(before.version)
    expect(frame).not.toContain('search i')
    expect(frame).not.toContain('┃')

    advance(TOAST_DURATION_MS.success - 1)
    expect(noticeOf(await screen.frame())).toEqual({ kind: 'done', text: 'Refreshed' })

    advance(1)
    const after = await screen.frame()

    expect(noticeOf(after)).toBeUndefined()
    expect(readFooter(after)).toEqual(before)
  })

  test('a refused key explains itself with a warning', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 }, { workspaces: agentWorkspaces })

    await screen.pressKey('o')
    await screen.pressKey('d')

    expect(noticeOf(await screen.frame())).toEqual({
      kind: 'warn',
      text: 'Close session unavailable: Close it in Herdr',
    })
    expect(wordColor(screen, 'warn')).toEqual(hex(colors.key))
  })

  test('the next refusal replaces the last one at once', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 }, { workspaces: agentWorkspaces })

    await screen.pressKey('o')
    await screen.pressKey('d')
    await screen.pressKey('x', { ctrl: true })
    await screen.pressKey('r')

    expect(noticeOf(await screen.frame())).toEqual({
      kind: 'warn',
      text: 'Rename session unavailable: Rename it in Herdr',
    })
  })

  test('a short error fits one row and asks for any key', async () => {
    screen = await renderSessionScreen(
      { width: 110, height: 30 },
      { backend: failingOpenBackend() }
    )

    await screen.pressKey('RETURN')
    await screen.settle()

    expect(readNotice(await screen.frame())).toEqual({
      kind: 'error',
      text: 'the fixture has no attached client',
      more: 0,
      dismiss: true,
      rows: 1,
    })
    expect(wordColor(screen, 'error')).toEqual(hex(colors.danger))
  })

  test('a long error wraps under its message at 60 columns and stays until a key', async () => {
    screen = await renderSessionScreen(
      { width: 60, height: 18 },
      { backend: failingOpenBackend(LONG_FAILURE) }
    )
    jest.useFakeTimers()

    await screen.pressKey('RETURN')
    await flush()
    const frame = await screen.frame()
    const notice = readNotice(frame)

    expect(notice).toEqual({ kind: 'error', text: LONG_FAILURE, more: 0, dismiss: true, rows: 2 })

    // The footer grew by a row; the list gave it up, so the header still leads the screen.
    expect(frame.split('\n')[0]).toContain('mux-sesh')

    for (const row of rowsOf(frame)) expect(row.length).toBeLessThanOrEqual(60)

    advance(TOAST_DURATION_MS.error - 1)
    expect(noticeOf(await screen.frame())?.text).toBe(LONG_FAILURE)

    jest.useRealTimers()
    await screen.pressKey('o')

    expect(noticeOf(await screen.frame())).toEqual({
      kind: 'warn',
      text: 'Open agent sessions unavailable: No agent sessions',
    })
  })

  test('a warning that does not fit 60 columns wraps instead of hiding its reason', async () => {
    screen = await renderSessionScreen({ width: 60, height: 18 }, { workspaces: agentWorkspaces })

    await screen.pressKey('o')
    await screen.pressKey('d')
    const frame = await screen.frame()

    expect(noticeOf(frame)).toEqual({
      kind: 'warn',
      text: 'Close session unavailable: Close it in Herdr',
    })

    for (const row of rowsOf(frame)) expect(row.length).toBeLessThanOrEqual(60)
  })
})

async function openNew(fixture: Screen): Promise<void> {
  await fixture.pressKey('p', { ctrl: true })
  await fixture.replaceQuery('New session')
  await fixture.pressKey('RETURN')
  await fixture.settle()
}

async function warningAfterEnter(fixture: Screen, text: string): Promise<string> {
  await fixture.pressKey('RETURN')
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    await fixture.settle()
    const notice = noticeOf(await fixture.frame())

    if (notice?.text.includes(text)) {
      expect(notice.kind).toBe('warn')
      expect(wordColor(fixture, 'warn')).toEqual(hex(colors.key))

      return notice.text
    }

    await Bun.sleep(5)
  }

  throw new Error(`No notice containing '${text}' appeared after Enter`)
}

describe('refusals warn instead of failing', () => {
  const project = {
    title: 'api',
    desc: '',
    path: '/fixture/api',
    isSession: false,
    itemKind: 'project' as const,
  }

  test('Enter on New with nothing to open', async () => {
    screen = await renderSessionScreen({ width: 120, height: 32 })
    await openNew(screen)

    expect(await warningAfterEnter(screen, 'Nothing to open')).toStartWith(
      'Nothing to open: no projects'
    )
  })

  test('Enter on a query no project matches', async () => {
    screen = await renderSessionScreen({ width: 120, height: 32 }, { projects: [project] })
    await openNew(screen)
    await screen.replaceQuery('zzz')
    await screen.settle()

    expect(await warningAfterEnter(screen, "no project matches 'zzz'")).toStartWith(
      'Nothing to open'
    )
  })

  test('Enter on a named session here without a name', async () => {
    screen = await renderSessionScreen({ width: 120, height: 32 }, { projects: [project] })
    await openNew(screen)
    await screen.pressKey('g', { ctrl: true })
    await screen.settle()

    expect(await warningAfterEnter(screen, 'type a name')).toStartWith('Nothing was created')
  })

  test('Enter on a GitHub URL with credentials', async () => {
    screen = await renderSessionScreen({ width: 120, height: 32 }, { projects: [project] })
    await openNew(screen)
    await screen.replaceQuery('https://x-access-token:ghp_s3cret@github.com/acme/widget')
    await screen.settle()

    const warning = await warningAfterEnter(screen, 'username or token')

    expect(warning).not.toContain('ghp_s3cret')
  })
})

describe('persistent status lines', () => {
  test('stale inventory shows `stale` above the footer until a refresh recovers', async () => {
    const scripted = scriptedBackend([tmuxWorkspace('alpha'), tmuxWorkspace('beta')])
    screen = await renderSessionScreen({ width: 110, height: 30 }, { backend: scripted.backend })

    scripted.fail(new MultiplexerError('server-stopped', 'fixture server stopped'))
    await refresh(screen)
    const stale = await screen.frame()

    expect(statusLinesOf(stale)).toEqual([
      {
        kind: 'stale',
        text: 'fixture server stopped Existing sessions are unchanged; refresh will retry.',
      },
    ])
    expect(wordColor(screen, 'stale')).toEqual(hex(colors.key))
    expect(readFooter(stale).version).not.toBe('')

    scripted.respond([tmuxWorkspace('alpha'), tmuxWorkspace('beta')])
    await refresh(screen)

    expect(statusLinesOf(await screen.frame())).toEqual([])
  })
})

describe('footer notice row', () => {
  const footer = { global: [], target: [] }

  async function renderFooter(
    props: Partial<Parameters<typeof Footer>[0]>,
    width = 80
  ): Promise<{ frame: string; setup: Awaited<ReturnType<typeof testRender>> }> {
    const setup = await testRender(
      <ThemeProvider theme={colors}>
        <Footer
          footer={footer}
          width={width}
          version="v1.10.0"
          prefixActive={false}
          notice={undefined}
          moreNotices={0}
          statusLines={[]}
          {...props}
        />
      </ThemeProvider>,
      { width, height: 6 }
    )

    await setup.renderOnce()

    return { frame: setup.captureCharFrame(), setup }
  }

  test('an error with others waiting shows how many, muted, before the dismiss hint', async () => {
    const { frame, setup } = await renderFooter({
      notice: { id: 1, kind: 'error', message: 'Could not open' },
      moreNotices: 2,
    })

    try {
      expect(readNotice(frame)).toEqual({
        kind: 'error',
        text: 'Could not open',
        more: 2,
        dismiss: true,
        rows: 1,
      })

      const spans = setup.captureSpans().lines.flatMap(line => line.spans)
      expect(spans.find(span => span.text.includes('+2 more'))?.fg.toInts()).toEqual(
        hex(colors.textMuted)
      )
      expect(spans.find(span => span.text.includes('Could not open'))?.fg.toInts()).toEqual(
        hex(colors.text)
      )
    } finally {
      act(() => setup.renderer.destroy())
    }
  })

  test('a title leads the message', async () => {
    const { frame, setup } = await renderFooter({
      notice: { id: 1, kind: 'info', title: 'Update available', message: 'v9.9.9 is ready.' },
    })

    try {
      expect(noticeOf(frame)).toEqual({ kind: 'info', text: 'Update available: v9.9.9 is ready.' })
      expect(wordColor(setup, 'info')).toEqual(hex(colors.primary))
    } finally {
      act(() => setup.renderer.destroy())
    }
  })
})

describe('fitting status text', () => {
  test('text that fits stays on one row', () => {
    expect(fitStatusText('Refreshed', 40, 20)).toEqual(['Refreshed'])
  })

  test('wraps by word, the first row narrower, and ends with an ellipsis past the row limit', () => {
    const words = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ')
    const lines = fitStatusText(words, 20, 30)

    expect(lines).toHaveLength(STATUS_LINE_MAX_ROWS)
    expect(lines[0]?.length).toBeLessThanOrEqual(20)

    for (const line of lines.slice(1)) expect(line.length).toBeLessThanOrEqual(30)
    expect(lines.at(-1)).toEndWith('…')
    expect(lines.join(' ')).toStartWith('word0 word1 word2')
  })

  test('breaks a word longer than the row', () => {
    expect(fitStatusText('abcdefghij', 4, 6)).toEqual(['abcd', 'efghij'])
  })
})
