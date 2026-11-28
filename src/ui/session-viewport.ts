import { getSessionSection } from '../items/order'
import type { Item, SearchMatchMetadata } from '../items/item'
import { mapMiddleCutIndices, truncateMiddleCut } from '../util/truncate'
import { fitDialogLabelMatches, truncateDialogText } from './dialog-layout'
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

function getSessionSectionWindow(
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

export function getListRowWidth(listWidth: number): number {
  return Math.max(1, listWidth - ROW_CHROME_COLUMNS)
}

export function getTitleColumnWidth(items: Item[], getContext: (item: Item) => string): number {
  return items.reduce(
    (width, item) => (getContext(item) ? Math.max(width, item.title.length) : width),
    0
  )
}

// Match positions into the fitted title and context; positions under an ellipsis are dropped.
export interface ListRowMatches extends ListRowText {
  titleMatches: readonly number[]
  contextMatches: readonly number[]
}

const NO_MATCHES: readonly number[] = []

export function fitListRowWithMatches(
  title: string,
  context: string,
  width: number,
  titleColumn: number,
  match: SearchMatchMetadata | undefined
): ListRowMatches {
  if (!context) {
    const fitted = truncateDialogText(title, width)

    return {
      title: fitted,
      spacer: '',
      context: '',
      titleMatches: fitDialogLabelMatches(title, fitted, match?.titleIndices),
      contextMatches: NO_MATCHES,
    }
  }

  const column = Math.max(1, Math.min(titleColumn, Math.floor(width * TITLE_COLUMN_SHARE)))
  const fittedTitle = truncateDialogText(title, column)
  const spacer = ' '.repeat(Math.max(MIN_COLUMN_GAP, column - fittedTitle.length + MIN_COLUMN_GAP))
  const contextWidth = width - fittedTitle.length - spacer.length
  const titleMatches = fitDialogLabelMatches(title, fittedTitle, match?.titleIndices)

  if (contextWidth <= 0) {
    return { title: fittedTitle, spacer: '', context: '', titleMatches, contextMatches: NO_MATCHES }
  }

  const cut = truncateMiddleCut(context, contextWidth)
  const descIndices = match?.descIndices

  return {
    title: fittedTitle,
    spacer,
    context: cut.text,
    titleMatches,
    contextMatches:
      descIndices && descIndices.length > 0 ? mapMiddleCutIndices(cut, descIndices) : NO_MATCHES,
  }
}

export function fitListRow(
  title: string,
  context: string,
  width: number,
  titleColumn: number
): ListRowText {
  const row = fitListRowWithMatches(title, context, width, titleColumn, undefined)

  return { title: row.title, spacer: row.spacer, context: row.context }
}
