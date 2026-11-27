import { getSessionSection } from '../items/order'
import type { Item } from '../types'
import { truncateMiddle } from '../util/truncate'
import { truncateDialogText } from './dialog-layout'
import { getVisibleWindow, type VisibleWindow } from './list-window'

const AGENTS_CHROME_ROWS = 2
const SECTION_HEADING_ROWS = 1
const SECTION_BREAK_ROWS = 2
const MIN_COLUMN_GAP = 2
const TITLE_COLUMN_SHARE = 0.6
const ROW_CHROME_COLUMNS = 4

export interface SessionViewportInput {
  rows: number
  sessions: Item[]
  agents: Item[]
  cursor: number
  agentCursor: number
  agentsActive: boolean
}

export type AgentsViewport = { kind: 'hidden' } | { kind: 'shown'; window: VisibleWindow<Item> }

export interface SessionViewport {
  sessions: VisibleWindow<Item>
  agents: AgentsViewport
}

export interface ListRowText {
  title: string
  spacer: string
  context: string
}

function getSessionWindowRows(window: VisibleWindow<Item>): number {
  return window.items.reduce((rows, item, index) => {
    const previous = window.items[index - 1]

    if (!previous) return rows + SECTION_HEADING_ROWS + 1

    return (
      rows + (getSessionSection(item) === getSessionSection(previous) ? 1 : SECTION_BREAK_ROWS + 1)
    )
  }, 0)
}

function getSessionSectionRows(sessions: Item[]): number {
  return sessions.length === 0 ? 1 : getSessionWindowRows({ items: sessions, startIndex: 0 })
}

export function getSessionSectionWindow(
  sessions: Item[],
  cursor: number,
  rows: number
): VisibleWindow<Item> {
  for (let count = Math.min(rows, sessions.length); count > 1; count--) {
    const window = getVisibleWindow(sessions, cursor, count)

    if (getSessionWindowRows(window) <= rows) return window
  }

  return getVisibleWindow(sessions, cursor, 1)
}

export function getSessionViewport({
  rows,
  sessions,
  agents,
  cursor,
  agentCursor,
  agentsActive,
}: SessionViewportInput): SessionViewport {
  if (agents.length === 0 && !agentsActive) {
    return { sessions: getSessionSectionWindow(sessions, cursor, rows), agents: { kind: 'hidden' } }
  }

  const sectionRows = Math.max(1, rows - AGENTS_CHROME_ROWS)
  const agentNeed = Math.max(1, agents.length)
  const agentShare = Math.max(1, Math.floor((sectionRows * (agentsActive ? 2 : 1)) / 3))
  const minSessionRows = sessions.length > 0 ? SECTION_HEADING_ROWS + 1 : 1

  const sessionRows = Math.max(
    minSessionRows,
    Math.min(getSessionSectionRows(sessions), sectionRows - Math.min(agentNeed, agentShare))
  )

  const agentRows = Math.max(1, Math.min(agentNeed, sectionRows - sessionRows))

  return {
    sessions: getSessionSectionWindow(sessions, cursor, sessionRows),
    agents: { kind: 'shown', window: getVisibleWindow(agents, agentCursor, agentRows) },
  }
}

function getWrappedLineRows(line: string, width: number): number {
  let rows = 1
  let used = 0

  for (const word of line.split(' ')) {
    if (used > 0 && used + 1 + word.length <= width) {
      used += 1 + word.length
      continue
    }

    if (used > 0) rows++
    rows += Math.floor(Math.max(0, word.length - 1) / width)
    used = word.length === 0 ? 0 : word.length % width || width
  }

  return rows
}

export function getWrappedRowCount(text: string, width: number): number {
  const safeWidth = Math.max(1, width)

  return text.split('\n').reduce((rows, line) => rows + getWrappedLineRows(line, safeWidth), 0)
}

export function getListRowWidth(listWidth: number): number {
  return Math.max(1, listWidth - ROW_CHROME_COLUMNS)
}

export function getTitleColumnWidth(items: Item[], getContext: (item: Item) => string): number {
  return items.reduce(
    (width, item) => (getContext(item) ? Math.max(width, item.title.length) : width),
    0
  )
}

export function fitListRow(
  title: string,
  context: string,
  width: number,
  titleColumn: number
): ListRowText {
  if (!context) return { title: truncateDialogText(title, width), spacer: '', context: '' }

  const column = Math.max(1, Math.min(titleColumn, Math.floor(width * TITLE_COLUMN_SHARE)))
  const fittedTitle = truncateDialogText(title, column)
  const spacer = ' '.repeat(Math.max(MIN_COLUMN_GAP, column - fittedTitle.length + MIN_COLUMN_GAP))
  const contextWidth = width - fittedTitle.length - spacer.length

  return contextWidth > 0
    ? { title: fittedTitle, spacer, context: truncateMiddle(context, contextWidth) }
    : { title: fittedTitle, spacer: '', context: '' }
}
