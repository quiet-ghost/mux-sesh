import { afterEach, describe, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { act, type ReactNode } from 'react'
import type { StartupState } from '../src/app/state'
import { resolveTheme, ThemeProvider } from '../src/styles/theme'
import type { ThemeColors } from '../src/types'
import { ErrorScreen } from '../src/ui/ErrorScreen'
import { FailurePalette } from '../src/ui/failure-screen'
import { StartupErrorScreen } from '../src/ui/StartupErrorScreen'
import { DiagnosticReport } from '../src/util/errors'
import { cellsOf, sameColor, type Cell } from './fixtures/selection'

// Body text sits one space inside the pane's left border.
const INSET = 2

// A nested pane's text sits one space inside its own border, which starts at the body inset.
const NESTED_INSET = INSET + 2
const ACCENT_BARS = /[┃▌▐]/

const SIZES = [
  { width: 100, height: 26 },
  { width: 60, height: 18 },
]

const THEMES = [
  { theme: 'rosepine', colorScheme: 'dark' as const },
  { theme: 'github', colorScheme: 'light' as const },
]

let setup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  const current = setup
  setup = undefined

  if (current) act(() => current.renderer.destroy())
})

interface Rendered {
  rows: Cell[][]
  frame: string
  copied: string[]
  press: (key: string) => Promise<Rendered>
}

async function render(
  node: ReactNode,
  theme: ThemeColors,
  size: { width: number; height: number },
  copied: string[] = []
): Promise<Rendered> {
  setup = await testRender(<ThemeProvider theme={theme}>{node}</ThemeProvider>, {
    ...size,
    consoleMode: 'disabled',
  })

  const current = setup

  const capture = async (): Promise<Rendered> => {
    await act(async () => {})
    await current.renderOnce()

    return {
      rows: current.captureSpans().lines.map(cellsOf),
      frame: current.captureCharFrame(),
      copied,
      press: async key => {
        await act(async () => current.mockInput.pressKey(key))

        return capture()
      },
    }
  }

  return capture()
}

function textOf(row: Cell[]): string {
  return row.map(cell => cell.char).join('')
}

function rowWith(rows: Cell[][], text: string): number {
  const index = rows.findIndex(row => textOf(row).includes(text))

  if (index < 0)
    throw new Error(`No rendered row contains ${text}:\n${rows.map(textOf).join('\n')}`)

  return index
}

function rowAt(rows: Cell[][], index: number): Cell[] {
  const row = rows[index]

  if (!row) throw new Error(`Row ${index} was not rendered`)

  return row
}

function cellAt(row: Cell[], column: number): Cell {
  const cell = row[column]

  if (!cell) throw new Error(`Column ${column} was not rendered`)

  return cell
}

function crashReport(): DiagnosticReport {
  const error = new Error('Cannot read properties of undefined (reading "title") [items]')
  error.stack = ''

  return DiagnosticReport.capture(error, {
    muxSeshVersion: '1.2.3',
    bunVersion: '1.3.14',
    os: 'linux 6.0',
    architecture: 'x64',
    terminal: 'ghostty 1.0',
    backend: 'tmux',
  })
}

function largeReport(): DiagnosticReport {
  const error = new Error('large trace')
  error.stack = 'trace line\n'.repeat(400)

  return DiagnosticReport.capture(error)
}

function crashScreen(report: DiagnosticReport, copied: string[] = []): ReactNode {
  return (
    <ErrorScreen
      report={report}
      onRetry={() => {}}
      onQuit={() => {}}
      actions={{
        copy: text => {
          copied.push(text)

          return { kind: 'copied' }
        },
        open: async () => true,
      }}
    />
  )
}

function startupScreen(kind: 'failed' | 'retrying'): ReactNode {
  const startup: Extract<StartupState, { kind: 'failed' | 'retrying' }> = {
    kind,
    failure: { stage: 'backend', message: 'Herdr is configured, but its server is not running.' },
  }

  return <StartupErrorScreen startup={startup} onRetry={() => {}} onQuit={() => {}} />
}

function expectBorderCell(cell: Cell, char: string, colors: ThemeColors) {
  expect(cell.char).toBe(char)
  expect(sameColor(cell.fg, colors.border)).toBe(true)
}

// One full-screen pane on the theme background: a muted single-line border with the title set into
// its top edge in the danger color, a muted description as the first body row, and every other
// row closed by the side borders, so nothing wraps through them. No accent bars, no rounded card.
function expectPane(screen: Rendered, colors: ThemeColors, title: string, description: string) {
  const top = rowAt(screen.rows, 0)
  const bottom = rowAt(screen.rows, screen.rows.length - 1)
  const width = top.length

  expect(textOf(top)).toMatch(new RegExp(`^┌─ ${title} ─+┐$`))
  expectBorderCell(cellAt(top, 0), '┌', colors)
  expectBorderCell(cellAt(top, 1), '─', colors)
  expectBorderCell(cellAt(top, width - 1), '┐', colors)

  for (let column = 3; column < 3 + title.length; column++)
    expect(sameColor(cellAt(top, column).fg, colors.danger)).toBe(true)

  expect(textOf(bottom)).toMatch(/^└─+┘$/)
  expectBorderCell(cellAt(bottom, 0), '└', colors)
  expectBorderCell(cellAt(bottom, width - 1), '┘', colors)

  for (const row of screen.rows.slice(1, -1)) {
    const rule = cellAt(row, 0).char === '├'

    expectBorderCell(cellAt(row, 0), rule ? '├' : '│', colors)
    expectBorderCell(cellAt(row, width - 1), rule ? '┤' : '│', colors)
  }

  expect(screen.rows.every(row => row.every(cell => sameColor(cell.bg, colors.background)))).toBe(
    true
  )

  expect(screen.frame).not.toMatch(ACCENT_BARS)
  expect(screen.frame).not.toMatch(/[╭╮╰╯]/)

  const below = rowAt(screen.rows, 1)
  expect(textOf(below).indexOf(description)).toBe(INSET)
  expect(sameColor(cellAt(below, INSET).fg, colors.textMuted)).toBe(true)
}

// The footer is the row above the bottom border, under a rule joined to both side borders. Each
// label is text-colored and its key muted; the end group sits one space inside the right border.
function expectFooter(
  screen: Rendered,
  colors: ThemeColors,
  left: ReadonlyArray<readonly [string, string]>,
  right: string | undefined
) {
  const footer = rowAt(screen.rows, screen.rows.length - 2)
  const rule = rowAt(screen.rows, screen.rows.length - 3)
  const text = textOf(footer)
  const leftText = left.map(([label, key]) => `${label} ${key}`).join('  ')

  expect(textOf(rule)).toMatch(/^├─+┤$/)
  expect(rule.every(cell => sameColor(cell.fg, colors.border))).toBe(true)
  expect(text.indexOf(leftText)).toBe(INSET)

  if (right) expect(text.endsWith(` ${right} │`)).toBe(true)
  else expect(text.slice(1, -1).trim()).toBe(leftText)

  for (const [label, key] of left) {
    const at = text.indexOf(`${label} ${key}`)

    expect(sameColor(cellAt(footer, at).fg, colors.text)).toBe(true)
    expect(sameColor(cellAt(footer, at + label.length + 1).fg, colors.textMuted)).toBe(true)
  }
}

const STATUS_COLOR = {
  done: 'active',
  warning: 'key',
  error: 'danger',
  info: 'primary',
} as const satisfies Record<string, keyof ThemeColors>

// A notice is a status line, not a card: the kind word in its color, then the message in body
// text, wrapped inside the pane and ending on the row just above the footer rule.
function expectStatusLine(
  screen: Rendered,
  colors: ThemeColors,
  word: keyof typeof STATUS_COLOR,
  start: string,
  end: string
) {
  const first = rowWith(screen.rows, `${word} ${start}`)
  const row = rowAt(screen.rows, first)
  const messageColumn = INSET + word.length + 1

  expect(textOf(row).indexOf(`${word} ${start}`)).toBe(INSET)

  for (let column = INSET; column < INSET + word.length; column++)
    expect(sameColor(cellAt(row, column).fg, colors[STATUS_COLOR[word]])).toBe(true)

  expect(sameColor(cellAt(row, messageColumn).fg, colors.text)).toBe(true)
  expect(row.every(cell => sameColor(cell.bg, colors.background))).toBe(true)

  const last = screen.rows.length - 4
  expect(first).toBeLessThanOrEqual(last)
  expect(textOf(rowAt(screen.rows, last)).trimEnd().replace(/\s*│$/, '')).toEndWith(end)
}

describe('crash screen', () => {
  for (const { theme, colorScheme } of THEMES) {
    const colors = resolveTheme(theme, {}, colorScheme).colors

    for (const size of SIZES) {
      test(`matches the app chrome in ${theme} ${colorScheme} at ${size.width} x ${size.height}`, async () => {
        const screen = await render(crashScreen(crashReport()), colors, size)

        expectPane(screen, colors, 'mux-sesh crashed', 'An unexpected error stopped the picker')
        expectFooter(
          screen,
          colors,
          [
            ['copy', 'c'],
            ['share', 'o'],
            ['retry', 'r'],
            ['quit', 'q'],
          ],
          'scroll ↑/↓'
        )

        // The message is plain body text at the inset.
        const messageRow = rowAt(screen.rows, rowWith(screen.rows, 'Cannot read properties'))
        expect(textOf(messageRow).indexOf('Cannot read properties')).toBe(INSET)
        expect(sameColor(cellAt(messageRow, INSET).fg, colors.text)).toBe(true)

        // The report is a nested pane titled in muted text, its rows closed by its own border.
        const paneTop = rowWith(screen.rows, '┌─ diagnostics ─')
        const nestedTop = rowAt(screen.rows, paneTop)
        const width = nestedTop.length
        expect(textOf(nestedTop).indexOf('┌─ diagnostics ─')).toBe(INSET)
        expect(textOf(nestedTop).slice(INSET, width - INSET)).toMatch(/^┌─ diagnostics ─+┐$/)
        expectBorderCell(cellAt(nestedTop, INSET), '┌', colors)
        expect(sameColor(cellAt(nestedTop, INSET + 3).fg, colors.textMuted)).toBe(true)

        const paneBottom = screen.rows.findIndex(
          (row, index) => index > paneTop && textOf(row).slice(INSET).startsWith('└')
        )

        expect(paneBottom).toBeGreaterThan(paneTop + 1)
        expect(textOf(rowAt(screen.rows, paneBottom)).slice(INSET, width - INSET)).toMatch(/^└─+┘$/)

        for (const row of screen.rows.slice(paneTop + 1, paneBottom)) {
          expectBorderCell(cellAt(row, INSET), '│', colors)
          expectBorderCell(cellAt(row, width - INSET - 1), '│', colors)
        }

        const reportRow = rowAt(screen.rows, rowWith(screen.rows, 'Environment:'))
        expect(textOf(reportRow).indexOf('Environment:')).toBe(NESTED_INSET)
        expect(sameColor(cellAt(reportRow, NESTED_INSET).fg, colors.text)).toBe(true)
      })
    }
  }

  test('shows plain text on screen while copy and share keep the neutralized report', async () => {
    const colors = resolveTheme('rosepine', {}, 'dark').colors
    const report = crashReport()
    const copied: string[] = []
    const plain = 'Cannot read properties of undefined (reading "title") [items]'
    const screen = await render(crashScreen(report, copied), colors, { width: 100, height: 26 })

    expect(screen.frame).toContain(plain)
    expect(screen.frame).toContain(`Message:`)
    expect(screen.frame).not.toMatch(/[（）［］]/)

    await screen.press('c')
    expect(copied).toEqual([report.text])
    expect(copied[0]).toContain('（reading "title"） ［items］')
    expect(copied[0]).not.toContain(plain)

    const body = new URL(report.issueUrl).searchParams.get('body')
    expect(body).toContain('（reading "title"） ［items］')
    expect(body).not.toContain(plain)
  })

  test('shows a scroll indicator only when the report overflows', async () => {
    const colors = resolveTheme('rosepine', {}, 'dark').colors
    const fits = await render(crashScreen(crashReport()), colors, { width: 100, height: 40 })
    expect(fits.frame).not.toMatch(/[█▀▄]/)
    act(() => setup?.renderer.destroy())

    const overflows = await render(crashScreen(largeReport()), colors, { width: 100, height: 26 })
    const thumbRow = overflows.rows.findIndex(row => /[█▀▄]/.test(textOf(row)))
    const thumb = rowAt(overflows.rows, thumbRow)
    const column = textOf(thumb).search(/[█▀▄]/)

    // Inside the diagnostics pane's right border, on the pane background.
    expect(column).toBe(thumb.length - NESTED_INSET)
    expect(cellAt(thumb, column + 1).char).toBe('│')
    expect(sameColor(cellAt(thumb, column).bg, colors.background)).toBe(true)
  })

  test('the share confirmation swaps the footer to its own keys and shows a warning status line', async () => {
    const colors = resolveTheme('rosepine', {}, 'dark').colors
    const screen = await render(crashScreen(crashReport()), colors, { width: 60, height: 18 })
    const confirming = await screen.press('o')

    expectFooter(
      confirming,
      colors,
      [
        ['open', 'y/enter'],
        ['cancel', 'n/esc'],
        ['quit', 'q'],
      ],
      'review ↑/↓'
    )

    expectPane(confirming, colors, 'mux-sesh crashed', 'An unexpected error stopped the picker')
    expectStatusLine(confirming, colors, 'warning', 'Send the report below', 'report.')
  })

  test('a copy result is a status line colored by its outcome', async () => {
    const colors = resolveTheme('rosepine', {}, 'dark').colors
    const screen = await render(crashScreen(crashReport()), colors, { width: 100, height: 26 })
    const copied = await screen.press('c')

    expectPane(copied, colors, 'mux-sesh crashed', 'An unexpected error stopped the picker')
    expectStatusLine(copied, colors, 'done', 'Diagnostics copied to the clipboard', 'clipboard')
  })

  test('still renders with built-in colors when reading the theme throws', async () => {
    const colors = resolveTheme('rosepine', {}, 'dark').colors

    const broken: ThemeColors = {
      ...colors,
      get danger(): string {
        throw new Error('fixture theme failure')
      },
      text: 'not-a-color',
    }

    const screen = await render(crashScreen(crashReport()), broken, { width: 60, height: 18 })
    const top = rowAt(screen.rows, 0)
    const message = rowAt(screen.rows, rowWith(screen.rows, 'Cannot read properties'))

    expect(textOf(top)).toStartWith('┌─ mux-sesh crashed ─')
    expect(sameColor(cellAt(top, 3).fg, FailurePalette.fallback.danger)).toBe(true)
    expect(sameColor(cellAt(top, 0).fg, colors.border)).toBe(true)
    expect(sameColor(cellAt(message, INSET).fg, FailurePalette.fallback.text)).toBe(true)
    expect(sameColor(cellAt(top, 0).bg, colors.background)).toBe(true)
    expect(screen.frame).toContain('copy c')
  })
})

describe('startup failure screen', () => {
  for (const { theme, colorScheme } of THEMES) {
    const colors = resolveTheme(theme, {}, colorScheme).colors

    for (const size of SIZES) {
      test(`matches the app chrome in ${theme} ${colorScheme} at ${size.width} x ${size.height}`, async () => {
        const screen = await render(startupScreen('failed'), colors, size)

        expectPane(screen, colors, 'mux-sesh could not start', 'Multiplexer backend is unavailable')
        expectFooter(
          screen,
          colors,
          [
            ['retry', 'r'],
            ['quit', 'q'],
          ],
          undefined
        )

        const messageRow = rowAt(screen.rows, rowWith(screen.rows, 'Herdr is configured'))
        expect(textOf(messageRow).indexOf('Herdr is configured')).toBe(INSET)
        expect(sameColor(cellAt(messageRow, INSET).fg, colors.text)).toBe(true)

        const hintRow = rowAt(screen.rows, rowWith(screen.rows, 'Start or update the backend'))
        expect(textOf(hintRow).indexOf('Start or update the backend')).toBe(INSET)
        expect(sameColor(cellAt(hintRow, INSET).fg, colors.textMuted)).toBe(true)
      })
    }
  }

  test('a long message wraps inside the pane at 60 x 18', async () => {
    const colors = resolveTheme('rosepine', {}, 'dark').colors
    const message = `Herdr could not be reached at ${'/very/long/socket/path'.repeat(6)} after a retry.`

    const startup: Extract<StartupState, { kind: 'failed' }> = {
      kind: 'failed',
      failure: { stage: 'backend', message },
    }

    const screen = await render(
      <StartupErrorScreen startup={startup} onRetry={() => {}} onQuit={() => {}} />,
      colors,
      { width: 60, height: 18 }
    )

    expectPane(screen, colors, 'mux-sesh could not start', 'Multiplexer backend is unavailable')
    expectFooter(
      screen,
      colors,
      [
        ['retry', 'r'],
        ['quit', 'q'],
      ],
      undefined
    )

    const body = screen.rows
      .slice(1, -3)
      .map(row => textOf(row).slice(INSET, -INSET))
      .join('')
      .replace(/\s+/g, '')

    expect(body).toContain(message.replace(/\s+/g, ''))
  })

  test('a running retry drops the retry key and says it is retrying', async () => {
    const colors = resolveTheme('rosepine', {}, 'dark').colors
    const screen = await render(startupScreen('retrying'), colors, { width: 60, height: 18 })

    expectPane(screen, colors, 'mux-sesh could not start', 'Multiplexer backend is unavailable')
    expectFooter(screen, colors, [['quit', 'q']], 'Retrying…')
    expect(screen.frame).not.toContain('retry r')
  })
})
