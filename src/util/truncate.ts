const ELLIPSIS = '…'
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/

// A path keeps at least this many cells before the words after it are cut.
const MIN_PATH_CELLS = 16

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

// Terminal cells, not UTF-16 units: wide characters take two, combining marks none.
export function displayWidth(text: string): number {
  return PRINTABLE_ASCII.test(text) ? text.length : Bun.stringWidth(text)
}

interface Cell {
  readonly text: string
  readonly width: number
}

interface Fit {
  readonly count: number
  readonly width: number
}

function cellsOf(text: string): Cell[] {
  if (PRINTABLE_ASCII.test(text)) return Array.from(text, char => ({ text: char, width: 1 }))

  return Array.from(graphemes.segment(text), ({ segment }) => ({
    text: segment,
    width: Bun.stringWidth(segment),
  }))
}

// How many cells, read in the given order, fit within the budget.
function fitCount(cells: readonly Cell[], budget: number, fromEnd: boolean): Fit {
  let count = 0
  let width = 0

  while (count < cells.length) {
    const cell = cells[fromEnd ? cells.length - 1 - count : count]

    if (!cell || width + cell.width > budget) break
    count++
    width += cell.width
  }

  return { count, width }
}

function join(cells: readonly Cell[]): string {
  return cells.map(cell => cell.text).join('')
}

// Keeps the start, then the end, never splitting a grapheme.
export function truncateMiddle(text: string, width: number): string {
  if (displayWidth(text) <= width) return text

  if (width <= 0) return ''

  const cells = cellsOf(text)
  const budget = width - 1
  const head = fitCount(cells, Math.ceil(budget / 2), false)
  const tail = fitCount(cells.slice(head.count), budget - head.width, true)

  return `${join(cells.slice(0, head.count))}${ELLIPSIS}${join(cells.slice(cells.length - tail.count))}`
}

export function truncateEnd(text: string, width: number): string {
  if (displayWidth(text) <= width) return text

  if (width <= 0) return ''

  const cells = cellsOf(text)

  return `${join(cells.slice(0, fitCount(cells, width - 1, false).count))}${ELLIPSIS}`
}

// Fits text that names a path: the path shrinks in the middle first, keeping the words around it;
// the words after it are cut only once the path is down to a readable minimum.
export function truncatePathInText(text: string, path: string, width: number): string {
  if (displayWidth(text) <= width) return text

  const at = path ? text.indexOf(path) : -1

  if (at < 0) return truncateEnd(text, width)

  const before = text.slice(0, at)
  const after = text.slice(at + path.length)
  const room = width - displayWidth(before) - displayWidth(after)

  const pathWidth = Math.min(
    width - displayWidth(before),
    Math.max(room, Math.min(displayWidth(path), MIN_PATH_CELLS))
  )

  return truncateEnd(`${before}${truncateMiddle(path, pathWidth)}${after}`, width)
}
