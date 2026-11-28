import type { RGBA } from '@opentui/core'

// Reads the status line at the bottom of the picker as rendered. A notice takes the footer row
// that holds the version badge: its kind word, two spaces, the message, then any `+N more` and
// `any key` hints before the version. A long message continues on the rows below it, indented
// under the message. Persistent status lines sit above that row in the same shape.

export type NoticeWord = 'info' | 'done' | 'warn' | 'error'

export type StatusWord = 'stale' | 'warn'

export interface Notice {
  readonly kind: NoticeWord
  readonly text: string
}

export interface NoticeRow extends Notice {
  readonly more: number
  readonly dismiss: boolean
  // Footer rows the notice takes, its first row included.
  readonly rows: number
}

export interface StatusLine {
  readonly kind: StatusWord
  readonly text: string
}

const VERSION_TAIL = /\s{2,}(?:v\d+\.\d+\.\d+(?: -> v\d+\.\d+\.\d+)?|dev)\s*$/
const DISMISS_TAIL = /\s{2,}any key$/
const MORE_TAIL = /\s{2,}\+(\d+) more$/
const NOTICE_HEAD = /^ (info|done|warn|error) {2}(\S.*)$/
const STATUS_HEAD = /^ (stale|warn) {2}(\S.*)$/

function isNoticeWord(word: string): word is NoticeWord {
  return word === 'info' || word === 'done' || word === 'warn' || word === 'error'
}

function isStatusWord(word: string): word is StatusWord {
  return word === 'stale' || word === 'warn'
}

function rowsOf(frame: string): string[] {
  const rows = frame.split('\n')

  while (rows.length > 0 && rows.at(-1)?.trim() === '') rows.pop()

  return rows
}

// The footer row is the last row that ends with the version badge.
function versionRowIndex(rows: readonly string[]): number {
  const index = rows.findLastIndex(row => VERSION_TAIL.test(row))

  if (index < 0)
    throw new Error(`No footer row with a version badge was rendered:\n${rows.join('\n')}`)

  return index
}

function continuation(rows: readonly string[], indent: number): string[] {
  const prefix = ' '.repeat(indent)

  return rows.map(row => {
    if (!row.startsWith(prefix) || row.trim() === '') {
      throw new Error(`A status continuation row is not indented under its message:\n${row}`)
    }

    return row.trim()
  })
}

export function readNotice(frame: string): NoticeRow | undefined {
  const rows = rowsOf(frame)
  const index = versionRowIndex(rows)
  const row = rows[index] ?? ''
  let body = row.slice(0, VERSION_TAIL.exec(row)?.index ?? row.length).trimEnd()

  const dismiss = DISMISS_TAIL.test(body)
  body = body.replace(DISMISS_TAIL, '')

  const more = MORE_TAIL.exec(body)
  body = body.replace(MORE_TAIL, '')

  const head = NOTICE_HEAD.exec(body)
  const word = head?.[1]

  if (!head || word === undefined || !isNoticeWord(word)) return undefined

  const rest = continuation(rows.slice(index + 1), word.length + 3)

  return {
    kind: word,
    text: [head[2]?.trim() ?? '', ...rest].join(' '),
    more: more ? Number(more[1]) : 0,
    dismiss,
    rows: 1 + rest.length,
  }
}

export function noticeOf(frame: string): Notice | undefined {
  const notice = readNotice(frame)

  return notice && { kind: notice.kind, text: notice.text }
}

// Rows above the footer row that start with a status word, each joined with its continuation.
export function statusLinesOf(frame: string): StatusLine[] {
  const rows = rowsOf(frame)
  const above = rows.slice(0, versionRowIndex(rows))
  let start = above.length

  while (start > 0 && /^ \S| {6,}\S/.test(above[start - 1] ?? '')) start--

  const lines: StatusLine[] = []
  let current: { kind: StatusWord; parts: string[] } | undefined

  for (const row of above.slice(start)) {
    const head = STATUS_HEAD.exec(row)
    const word = head?.[1]

    if (head && word !== undefined && isStatusWord(word)) {
      if (current) lines.push({ kind: current.kind, text: current.parts.join(' ') })
      current = { kind: word, parts: [head[2]?.trim() ?? ''] }
      continue
    }

    if (!current) continue
    current.parts.push(...continuation([row], current.kind.length + 3))
  }

  if (current) lines.push({ kind: current.kind, text: current.parts.join(' ') })

  return lines
}

interface SpanRow {
  readonly spans: readonly { readonly text: string; readonly fg: RGBA }[]
}

// The color of the status word on the last row that starts with it.
export function statusWordColor(
  rows: readonly SpanRow[],
  word: NoticeWord | StatusWord
): ReturnType<RGBA['toInts']> | undefined {
  const row = rows.findLast(line =>
    line.spans
      .map(span => span.text)
      .join('')
      .startsWith(` ${word}  `)
  )

  return row?.spans.find(span => span.text.trim() === word)?.fg.toInts()
}
