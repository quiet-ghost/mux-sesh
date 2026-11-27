import { expect } from 'bun:test'
import type { ThemeColors } from '../../src/types'
import { sameColor, type Cell } from './selection'

// Body text sits one space inside a pane's left border.
export const PANE_INSET = 2

const ACCENT_BARS = /[┃▌▐]/
const ROUNDED_CORNERS = /[╭╮╰╯]/

// A rendered pane: its border rows and columns on the captured screen, inclusive.
export interface PaneBox {
  readonly rows: Cell[][]
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number
}

export interface PaneLook {
  readonly title: string
  readonly titleColor: string
  readonly background: string
  // The muted first body row, when the pane has one.
  readonly description?: string
  // The selected list row's fill, the one other background allowed inside the border.
  readonly highlight?: string
}

export type PaneHint = readonly [label: string, key: string]

// Text wraps inside a pane's side borders; reading a frame as running text drops them.
export function withoutSideBorders(frame: string): string {
  return frame.replace(/│/g, ' ')
}

export function textOf(row: readonly Cell[]): string {
  return row.map(cell => cell.char).join('')
}

export function rowAt(rows: Cell[][], index: number): Cell[] {
  const row = rows[index]

  if (!row) throw new Error(`Row ${index} was not rendered`)

  return row
}

export function cellAt(row: readonly Cell[], column: number): Cell {
  const cell = row[column]

  if (!cell) throw new Error(`Column ${column} was not rendered`)

  return cell
}

// The pane whose top border starts with `title`: from its `┌` to the `┐` on that row, down to
// the first `└` under its left corner.
export function findPane(rows: Cell[][], title: string): PaneBox {
  const label = `┌─ ${title}`
  const top = rows.findIndex(row => textOf(row).includes(label))

  if (top < 0) {
    throw new Error(`No pane is titled ${title}:\n${rows.map(textOf).join('\n')}`)
  }

  const header = textOf(rowAt(rows, top))
  const left = header.indexOf(label)
  const right = header.indexOf('┐', left)
  const bottom = rows.findIndex((row, index) => index > top && row[left]?.char === '└')

  if (right < 0 || bottom < 0) {
    throw new Error(`The pane titled ${title} is not closed:\n${rows.map(textOf).join('\n')}`)
  }

  return { rows, top, bottom, left, right }
}

// The text between a pane row's side borders.
export function paneRowText(pane: PaneBox, index: number): string {
  return textOf(rowAt(pane.rows, index).slice(pane.left + 1, pane.right))
}

// The index of the first body row holding `text`.
export function paneRowWith(pane: PaneBox, text: string): number {
  for (let index = pane.top + 1; index < pane.bottom; index++) {
    if (paneRowText(pane, index).includes(text)) return index
  }

  throw new Error(`No row of the pane contains ${text}`)
}

export function expectBorderCell(cell: Cell, char: string, colors: ThemeColors): void {
  expect(cell.char).toBe(char)
  expect(sameColor(cell.fg, colors.border)).toBe(true)
}

// A tmux-style pane: a muted single-line border with the title set into its top edge in its own
// color, every body row closed by the side borders so nothing wraps through them, one background
// throughout, and no accent bars or rounded card. The description is the muted first body row.
export function expectPane(pane: PaneBox, colors: ThemeColors, look: PaneLook): void {
  const top = rowAt(pane.rows, pane.top)
  const bottom = rowAt(pane.rows, pane.bottom)
  const { left, right } = pane

  expect(textOf(top.slice(left, right + 1))).toMatch(new RegExp(`^┌─ ${escape(look.title)} ─+┐$`))
  expectBorderCell(cellAt(top, left), '┌', colors)
  expectBorderCell(cellAt(top, left + 1), '─', colors)
  expectBorderCell(cellAt(top, right - 1), '─', colors)
  expectBorderCell(cellAt(top, right), '┐', colors)

  for (let column = left + 3; column < left + 3 + look.title.length; column++)
    expect(sameColor(cellAt(top, column).fg, look.titleColor)).toBe(true)

  expect(textOf(bottom.slice(left, right + 1))).toMatch(/^└─+┘$/)
  expectBorderCell(cellAt(bottom, left), '└', colors)
  expectBorderCell(cellAt(bottom, right), '┘', colors)

  for (const row of pane.rows.slice(pane.top + 1, pane.bottom)) {
    const rule = cellAt(row, left).char === '├'

    expectBorderCell(cellAt(row, left), rule ? '├' : '│', colors)
    expectBorderCell(cellAt(row, right), rule ? '┤' : '│', colors)
  }

  const box = pane.rows.slice(pane.top, pane.bottom + 1).map(row => row.slice(left, right + 1))
  const { highlight } = look

  const bodyBackground = (cell: Cell) =>
    sameColor(cell.bg, look.background) ||
    (highlight !== undefined && sameColor(cell.bg, highlight))

  for (const [index, row] of box.entries()) {
    const border = index === 0 || index === box.length - 1

    expect(
      row.every((cell, column) =>
        border || column === 0 || column === row.length - 1
          ? sameColor(cell.bg, look.background)
          : bodyBackground(cell)
      )
    ).toBe(true)
  }

  const text = box.map(textOf).join('\n')
  expect(text).not.toMatch(ACCENT_BARS)
  expect(text).not.toMatch(ROUNDED_CORNERS)

  if (look.description !== undefined) {
    const below = rowAt(pane.rows, pane.top + 1)

    expect(textOf(below).indexOf(look.description)).toBe(left + PANE_INSET)
    expect(sameColor(cellAt(below, left + PANE_INSET).fg, colors.textMuted)).toBe(true)
  }
}

// The footer is the row above the bottom border, under a rule joined to both side borders. Each
// label is text-colored and its key muted; the end group sits one space inside the right border.
export function expectPaneFooter(
  pane: PaneBox,
  colors: ThemeColors,
  hints: readonly PaneHint[],
  end?: string
): void {
  const footer = rowAt(pane.rows, pane.bottom - 1)
  const rule = rowAt(pane.rows, pane.bottom - 2).slice(pane.left, pane.right + 1)
  const text = textOf(footer.slice(pane.left, pane.right + 1))
  const hintText = hints.map(([label, key]) => `${label} ${key}`).join('  ')

  expect(textOf(rule)).toMatch(/^├─+┤$/)
  expect(rule.every(cell => sameColor(cell.fg, colors.border))).toBe(true)
  expect(text.indexOf(hintText)).toBe(PANE_INSET)

  if (end) expect(text.endsWith(` ${end} │`)).toBe(true)
  else expect(text.slice(1, -1).trim()).toBe(hintText)

  for (const [label, key] of hints) {
    const at = pane.left + text.indexOf(`${label} ${key}`)

    expect(sameColor(cellAt(footer, at).fg, colors.text)).toBe(true)
    expect(sameColor(cellAt(footer, at + label.length + 1).fg, colors.textMuted)).toBe(true)
  }
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
