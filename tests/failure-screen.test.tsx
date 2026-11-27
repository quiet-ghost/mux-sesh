import { afterEach, describe, expect, test } from 'bun:test'
import { TextAttributes } from '@opentui/core'
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

const INSET = 2
const ACCENT = '┃'

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

// The header is an accent bar in the danger color beside a bold title and a muted description.
function expectHeader(screen: Rendered, colors: ThemeColors, title: string, description: string) {
  const titleRow = rowWith(screen.rows, title)
  const header = rowAt(screen.rows, titleRow)
  const below = rowAt(screen.rows, titleRow + 1)
  const titleColumn = textOf(header).indexOf(title)

  expect(titleRow).toBe(1)
  expect(cellAt(header, INSET).char).toBe(ACCENT)
  expect(sameColor(cellAt(header, INSET).fg, colors.danger)).toBe(true)
  expect(titleColumn).toBe(INSET + 2)
  expect(sameColor(cellAt(header, titleColumn).fg, colors.text)).toBe(true)
  expect(cellAt(header, titleColumn).attributes & TextAttributes.BOLD).toBeTruthy()

  expect(cellAt(below, INSET).char).toBe(ACCENT)
  expect(sameColor(cellAt(below, INSET).fg, colors.danger)).toBe(true)
  expect(textOf(below).indexOf(description)).toBe(INSET + 2)
  expect(sameColor(cellAt(below, INSET + 2).fg, colors.textMuted)).toBe(true)
}

// The band is the last row, edge to edge in the raised color, below one blank row; each label is
// text-colored and its key muted.
function expectFooter(
  screen: Rendered,
  colors: ThemeColors,
  left: ReadonlyArray<readonly [string, string]>,
  right: string | undefined
) {
  const footer = rowAt(screen.rows, screen.rows.length - 1)
  const above = rowAt(screen.rows, screen.rows.length - 2)
  const text = textOf(footer)
  const leftText = left.map(([label, key]) => `${label} ${key}`).join('  ')

  expect(footer.every(cell => sameColor(cell.bg, colors.surfaceAlt))).toBe(true)
  expect(text.indexOf(leftText)).toBe(INSET)

  if (right) {
    expect(text.trimEnd().endsWith(right)).toBe(true)
    expect(text.trimEnd().length).toBe(footer.length - INSET)
  } else {
    expect(text.trim()).toBe(leftText)
  }

  expect(textOf(above).trim()).toBe('')
  expect(above.every(cell => sameColor(cell.bg, colors.background))).toBe(true)

  for (const [label, key] of left) {
    const at = text.indexOf(`${label} ${key}`)

    expect(sameColor(cellAt(footer, at).fg, colors.text)).toBe(true)
    expect(sameColor(cellAt(footer, at + label.length + 1).fg, colors.textMuted)).toBe(true)
  }
}

describe('crash screen', () => {
  for (const { theme, colorScheme } of THEMES) {
    const colors = resolveTheme(theme, {}, colorScheme).colors

    for (const size of SIZES) {
      test(`matches the app chrome in ${theme} ${colorScheme} at ${size.width} x ${size.height}`, async () => {
        const screen = await render(crashScreen(crashReport()), colors, size)

        expectHeader(screen, colors, 'mux-sesh crashed', 'An unexpected error stopped the picker')
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

        // The whole screen sits on the theme background, without the old rounded box.
        expect(sameColor(cellAt(rowAt(screen.rows, 0), 0).bg, colors.background)).toBe(true)
        expect(screen.frame).not.toMatch(/[╭╮╰╯│]/)

        // The message is plain body text at the inset.
        const messageRow = rowAt(screen.rows, rowWith(screen.rows, 'Cannot read properties'))
        expect(textOf(messageRow).indexOf('Cannot read properties')).toBe(INSET)
        expect(sameColor(cellAt(messageRow, INSET).fg, colors.text)).toBe(true)

        // A muted bold section header names the report, which sits on a surface panel.
        const sectionRow = rowAt(screen.rows, rowWith(screen.rows, 'Diagnostics'))
        expect(textOf(sectionRow).indexOf('Diagnostics')).toBe(INSET)
        expect(sameColor(cellAt(sectionRow, INSET).fg, colors.textMuted)).toBe(true)
        expect(cellAt(sectionRow, INSET).attributes & TextAttributes.BOLD).toBeTruthy()

        const panelRow = rowAt(screen.rows, rowWith(screen.rows, 'Environment:'))
        const panel = panelRow.slice(INSET, panelRow.length - INSET)
        expect(panel.every(cell => sameColor(cell.bg, colors.surface))).toBe(true)
        expect(sameColor(cellAt(panelRow, INSET - 1).bg, colors.background)).toBe(true)
        expect(sameColor(cellAt(panelRow, panelRow.length - INSET).bg, colors.background)).toBe(
          true
        )
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

    expect(column).toBe(thumb.length - INSET - 1)
    expect(sameColor(cellAt(thumb, column).bg, colors.surface)).toBe(true)
  })

  test('the share confirmation swaps the footer to its own keys and shows a warning card', async () => {
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

    const cardRow = rowAt(confirming.rows, rowWith(confirming.rows, 'Send the report below'))
    const border = textOf(cardRow).indexOf(ACCENT)
    expect(border).toBe(INSET)
    expect(sameColor(cellAt(cardRow, border).fg, colors.key)).toBe(true)
    expect(sameColor(cellAt(cardRow, border + 2).bg, colors.surfaceAlt)).toBe(true)
    expect(sameColor(cellAt(cardRow, border + 2).fg, colors.text)).toBe(true)
  })

  test('a copy result is a card colored by its outcome', async () => {
    const colors = resolveTheme('rosepine', {}, 'dark').colors
    const screen = await render(crashScreen(crashReport()), colors, { width: 100, height: 26 })
    const copied = await screen.press('c')
    const cardRow = rowAt(copied.rows, rowWith(copied.rows, 'Diagnostics copied'))

    expect(cellAt(cardRow, INSET).char).toBe(ACCENT)
    expect(sameColor(cellAt(cardRow, INSET).fg, colors.active)).toBe(true)
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
    const header = rowAt(screen.rows, rowWith(screen.rows, 'mux-sesh crashed'))

    expect(sameColor(cellAt(header, INSET).fg, FailurePalette.fallback.danger)).toBe(true)
    expect(sameColor(cellAt(header, INSET + 2).fg, FailurePalette.fallback.text)).toBe(true)
    expect(sameColor(cellAt(header, 0).bg, colors.background)).toBe(true)
    expect(screen.frame).toContain('copy c')
  })
})

describe('startup failure screen', () => {
  for (const { theme, colorScheme } of THEMES) {
    const colors = resolveTheme(theme, {}, colorScheme).colors

    for (const size of SIZES) {
      test(`matches the app chrome in ${theme} ${colorScheme} at ${size.width} x ${size.height}`, async () => {
        const screen = await render(startupScreen('failed'), colors, size)

        expectHeader(
          screen,
          colors,
          'mux-sesh could not start',
          'Multiplexer backend is unavailable'
        )
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
        expect(sameColor(cellAt(hintRow, INSET).fg, colors.textMuted)).toBe(true)
        expect(sameColor(cellAt(rowAt(screen.rows, 0), 0).bg, colors.background)).toBe(true)
      })
    }
  }

  test('a running retry drops the retry key and says it is retrying', async () => {
    const colors = resolveTheme('rosepine', {}, 'dark').colors
    const screen = await render(startupScreen('retrying'), colors, { width: 60, height: 18 })

    expectFooter(screen, colors, [['quit', 'q']], 'Retrying…')
    expect(screen.frame).not.toContain('retry r')
  })
})
