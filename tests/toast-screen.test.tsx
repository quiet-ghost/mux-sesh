import { afterEach, describe, expect, test } from 'bun:test'
import { RGBA, TextAttributes } from '@opentui/core'
import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'
import type { LiveWorkspace, MultiplexerBackend } from '../src/multiplexer'
import { MultiplexerError } from '../src/multiplexer/types'
import { resolveTheme, ThemeProvider } from '../src/styles/theme'
import type { ThemeColors } from '../src/types'
import Toast from '../src/ui/Toast'
import { footerLineOf } from './fixtures/footer'
import { renderSessionScreen } from './fixtures/session-screen'
import { readToast, toastLinesOf } from './fixtures/toast'

type Screen = Awaited<ReturnType<typeof renderSessionScreen>>

let screen: Screen | undefined

afterEach(() => {
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

function unsupported(): never {
  throw new Error('The toast fixture backend does not implement that operation')
}

// Opening fails with an expected error, so Enter reports instead of exiting the test.
function failingOpenBackend(): MultiplexerBackend {
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
      throw new MultiplexerError('command-failed', 'the fixture has no attached client')
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

// The color of the card's `┃` border on the first card row.
function borderColor(fixture: Screen): number[] | undefined {
  for (const line of fixture.captureSpans().lines) {
    const border = line.spans.find(span => span.text.includes('┃'))

    if (border) return border.fg.toInts()
  }

  return undefined
}

function hex(color: string): ReturnType<RGBA['toInts']> {
  return RGBA.fromHex(color).toInts()
}

async function refresh(fixture: Screen): Promise<void> {
  await fixture.pressKey('x', { ctrl: true })
  await fixture.pressKey('R', { shift: true })
  await fixture.settle()
}

describe('toasts by kind', () => {
  test('a refresh confirms with a success toast, not a footer line', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 })

    await refresh(screen)
    const frame = await screen.frame()

    expect(readToast(frame)).toBe('Refreshed')
    expect(borderColor(screen)).toEqual(hex(colors.active))
    expect(frame.split('\n').at(-2)).not.toContain('Refreshed')
  })

  test('a refused key explains itself with a warning toast', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 }, { workspaces: agentWorkspaces })

    await screen.pressKey('o')
    await screen.pressKey('d')

    expect(readToast(await screen.frame())).toBe('Close session unavailable: Close it in Herdr')
    expect(borderColor(screen)).toEqual(hex(colors.key))
  })

  test('a failed open reports an error toast that wraps inside the card', async () => {
    screen = await renderSessionScreen({ width: 60, height: 18 }, { backend: failingOpenBackend() })

    await screen.pressKey('RETURN')
    await screen.settle()
    const frame = await screen.frame()

    expect(readToast(frame)).toBe('the fixture has no attached client')
    expect(borderColor(screen)).toEqual(hex(colors.danger))

    for (const line of frame.split('\n')) expect(line.length).toBeLessThanOrEqual(60)
    expect(footerLineOf(frame)).not.toContain('attached client')
  })

  test('the next refusal replaces the last one at once', async () => {
    screen = await renderSessionScreen({ width: 110, height: 30 }, { workspaces: agentWorkspaces })

    await screen.pressKey('o')
    await screen.pressKey('d')
    await screen.pressKey('x', { ctrl: true })
    await screen.pressKey('r')

    expect(readToast(await screen.frame())).toBe('Rename session unavailable: Rename it in Herdr')
    expect(borderColor(screen)).toEqual(hex(colors.key))
  })

  test('the next key after an error dismisses it and shows its own feedback', async () => {
    screen = await renderSessionScreen(
      { width: 110, height: 30 },
      { backend: failingOpenBackend() }
    )

    await screen.pressKey('RETURN')
    await screen.settle()
    expect(readToast(await screen.frame())).toBe('the fixture has no attached client')

    await screen.pressKey('o')

    expect(readToast(await screen.frame())).toBe(
      'Open agent sessions unavailable: No agent sessions'
    )
    expect(borderColor(screen)).toEqual(hex(colors.key))
  })
})

describe('toast card', () => {
  test('shows a bold title, the message, and how many more wait', async () => {
    const setup = await testRender(
      <ThemeProvider theme={colors}>
        <Toast
          toast={{ id: 1, kind: 'info', title: 'Update available', message: 'v9.9.9 is ready.' }}
          more={2}
          columns={80}
        />
      </ThemeProvider>,
      { width: 80, height: 12 }
    )

    try {
      await setup.renderOnce()

      expect(toastLinesOf(setup.captureCharFrame())).toEqual([
        'Update available',
        'v9.9.9 is ready.',
        '+2 more',
      ])

      const spans = setup.captureSpans().lines.flatMap(line => line.spans)
      const title = spans.find(span => span.text.includes('Update available'))
      const border = spans.find(span => span.text.includes('┃'))

      expect((title?.attributes ?? 0) & TextAttributes.BOLD).toBe(TextAttributes.BOLD)
      expect(border?.fg.toInts()).toEqual(hex(colors.primary))
    } finally {
      act(() => setup.renderer.destroy())
    }
  })
})
