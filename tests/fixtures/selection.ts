import { RGBA, type CapturedFrame, type CapturedLine, type CapturedSpan } from '@opentui/core'
import type { ThemeColors } from '../../src/types'

export interface SelectionScreen {
  frame(): Promise<string>
  captureSpans(): CapturedFrame
  colors(): ThemeColors
}

// Shorter runs are not rows: a selected row is painted from its first cell to its right edge.
const MIN_ROW_CELLS = 8

// The text of each run of cells painted with the selection background, trailing pad trimmed.
function highlightedRuns(line: CapturedLine, selection: string): string[] {
  const runs: string[] = []
  let run = ''

  for (const cell of cellsOf(line)) {
    if (sameColor(cell.bg, selection)) {
      run += cell.char
      continue
    }

    if (run.length >= MIN_ROW_CELLS) runs.push(run.trimEnd())
    run = ''
  }

  if (run.length >= MIN_ROW_CELLS) runs.push(run.trimEnd())

  return runs
}

// Every highlighted row on screen, top to bottom: the list row and, over it, any dialog's row.
export async function selectedRows(screen: SelectionScreen): Promise<string[]> {
  const frame = await screen.frame()
  const selection = screen.colors().selection
  const rows = screen.captureSpans().lines.flatMap(line => highlightedRuns(line, selection))

  if (rows.some(row => !frame.includes(row))) {
    throw new Error('A highlighted row does not match the rendered character frame')
  }

  return rows
}

// The one highlighted row; fails when none or several rows are highlighted.
export async function selectedRowText(screen: SelectionScreen): Promise<string> {
  const rows = await selectedRows(screen)
  const [row] = rows

  if (row === undefined || rows.length !== 1) {
    throw new Error(
      `Expected exactly one highlighted row, found ${rows.length}: ${JSON.stringify(rows)}`
    )
  }

  return row
}

// A list row's text: the mark cell ('*' when marked), a space, the status cell, then the title.
export function listRow(pattern: string): RegExp {
  return new RegExp(`^[ *] ${pattern}`)
}

export function sameColor(left: RGBA, right: string): boolean {
  const expected = RGBA.fromHex(right).toInts()

  return left.toInts().every((channel, index) => channel === expected[index])
}

export interface Cell {
  char: string
  fg: RGBA
  bg: RGBA
  attributes: number
}

export function cellsOf(line: CapturedLine): Cell[] {
  return line.spans.flatMap((span: CapturedSpan) =>
    span.text
      .split('')
      .map(char => ({ char, fg: span.fg, bg: span.bg, attributes: span.attributes }))
  )
}

// WCAG 2 relative-luminance contrast ratio between two hex colors.
export function contrastRatio(left: string, right: string): number {
  const luminance = (hex: string): number => {
    const [r = 0, g = 0, b = 0] = RGBA.fromHex(hex)
      .toInts()
      .slice(0, 3)
      .map(channel => channel / 255)
      .map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))

    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  const [high, low] = [luminance(left), luminance(right)].sort((a, b) => b - a)

  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
}
