import { RGBA, type CapturedLine, type CapturedSpan } from '@opentui/core'

// The selected row of every list starts with this accent bar; no other row shows it.
export const SELECTION_BAR = '┃'

// The bar, then the mark cell ('*' when the row is marked), then the row text.
export function selectedRow(pattern: string): RegExp {
  return new RegExp(`${SELECTION_BAR}[ *] ${pattern}`)
}

export function selectedLines(frame: string): string[] {
  return frame.split('\n').filter(line => line.includes(SELECTION_BAR))
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
