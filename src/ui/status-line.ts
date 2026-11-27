import type { QueuedToast } from '../app/notifications'
import { truncateDialogText } from './dialog-layout'
import { NOTICE_WORD } from './notice-kind'

// A long message wraps into the rows below its first, indented under it, so nothing it says is
// cut off; past this many rows the last one ends in an ellipsis.
export const STATUS_LINE_MAX_ROWS = 3
export const STATUS_PADDING_COLUMNS = 1
export const STATUS_WORD_GAP = '  '
export const STATUS_RIGHT_GAP = '  '

// The next key dismisses an error. Escape would also quit the list, so the hint does not name it.
export const DISMISS_HINT = 'any key'

// A persistent status above the footer: stale inventory, or a degraded file search.
export interface StatusLine {
  readonly kind: 'stale' | 'warn'
  readonly text: string
}

export interface NoticeLayout {
  readonly word: string
  // The message rows; the first sits beside the word, the rest under the message.
  readonly lines: readonly string[]
  readonly more: string
  readonly dismiss: boolean
}

// Greedy word wrap with a narrower first row; a word longer than a row breaks across rows.
export function fitStatusText(text: string, firstWidth: number, restWidth: number): string[] {
  const widthOf = (row: number): number => Math.max(1, row === 0 ? firstWidth : restWidth)
  const lines: string[] = []
  let line = ''

  for (const word of text.trim().split(/\s+/)) {
    let rest = word

    while (rest.length > 0) {
      const width = widthOf(lines.length)
      const joined = line ? `${line} ${rest}` : rest

      if (joined.length <= width) {
        line = joined
        break
      }

      if (line) {
        lines.push(line)
        line = ''
        continue
      }

      lines.push(rest.slice(0, width))
      rest = rest.slice(width)
    }
  }

  if (line || lines.length === 0) lines.push(line)

  if (lines.length <= STATUS_LINE_MAX_ROWS) return lines

  const last = STATUS_LINE_MAX_ROWS - 1

  return [...lines.slice(0, last), truncateDialogText(lines.slice(last).join(' '), widthOf(last))]
}

function messageColumns(width: number, word: string): number {
  return width - STATUS_PADDING_COLUMNS * 2 - word.length - STATUS_WORD_GAP.length
}

export function noticeText(notice: QueuedToast): string {
  return notice.title ? `${notice.title}: ${notice.message}` : notice.message
}

// The first row keeps the version (and any waiting count and dismiss hint) at its right.
export function fitNotice(
  notice: QueuedToast,
  more: number,
  width: number,
  version: string
): NoticeLayout {
  const word = NOTICE_WORD[notice.kind]
  const moreLabel = more > 0 ? `+${more} more` : ''
  const dismiss = notice.kind === 'error'

  const right = [moreLabel, dismiss ? DISMISS_HINT : '', version]
    .filter(Boolean)
    .join(STATUS_RIGHT_GAP)

  const columns = messageColumns(width, word)
  const first = columns - (right ? right.length + STATUS_RIGHT_GAP.length : 0)

  return {
    word,
    lines: fitStatusText(noticeText(notice), first, columns),
    more: moreLabel,
    dismiss,
  }
}

export function fitStatusLine(line: StatusLine, width: number): string[] {
  const columns = messageColumns(width, line.kind)

  return fitStatusText(line.text, columns, columns)
}

// Rows the status line takes beyond the footer's own row.
export function getStatusRows(
  notice: QueuedToast | undefined,
  more: number,
  statusLines: readonly StatusLine[],
  width: number,
  version: string
): number {
  const noticeRows = notice ? fitNotice(notice, more, width, version).lines.length - 1 : 0

  return statusLines.reduce((rows, line) => rows + fitStatusLine(line, width).length, noticeRows)
}
