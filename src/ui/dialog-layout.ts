const DIALOG_MARGIN_COLUMNS = 2
const DIALOG_MARGIN_ROWS = 1

// The side border and one space: at 60 columns the dialog is 56 wide and its body 52.
const DIALOG_INSET_COLUMNS = 2

// `┌─ ` before the title and ` ─┐` after it.
const DIALOG_TITLE_CHROME_COLUMNS = 6

// A row is the current-value mark, a space before the label and a right pad.
const DIALOG_ROW_CHROME_COLUMNS = 3

const MIN_LIST_ROWS = 4

export const DEFAULT_DIALOG_WIDTH = 76
const ELLIPSIS = '…'

export const DIALOG_FILTER_ROWS = 2

export interface DialogChrome {
  description?: string
}

export interface DialogRowText {
  label: string
  value: string
}

export function getDialogWidth(columns: number, preferredWidth: number): number {
  return Math.max(1, Math.min(preferredWidth, columns - DIALOG_MARGIN_COLUMNS * 2))
}

export function getDialogContentWidth(dialogWidth: number): number {
  return Math.max(1, dialogWidth - DIALOG_INSET_COLUMNS * 2)
}

export function getDialogRowWidth(dialogWidth: number): number {
  return Math.max(1, getDialogContentWidth(dialogWidth) - DIALOG_ROW_CHROME_COLUMNS)
}

// The title fits in the top border with at least one rule cell before the corner.
export function getDialogTitleWidth(dialogWidth: number): number {
  return Math.max(1, dialogWidth - DIALOG_TITLE_CHROME_COLUMNS)
}

// The titled top border, an optional description, the rule above the footer, the footer and the
// bottom border.
export function getDialogChromeRows({ description }: DialogChrome): number {
  const borders = 2
  const rule = 1
  const footer = 1

  return borders + (description ? 1 : 0) + rule + footer
}

export function getDialogListRows(rows: number, reservedRows: number): number {
  return Math.max(1, rows - DIALOG_MARGIN_ROWS * 2 - reservedRows)
}

export function fitsOptionalDialogRows(
  rows: number,
  reservedRows: number,
  optionalRows: number
): boolean {
  return getDialogListRows(rows, reservedRows + optionalRows) >= MIN_LIST_ROWS
}

export function truncateDialogText(text: string, width: number): string {
  if (text.length <= width) {
    return text
  }

  return width <= 0 ? '' : `${text.slice(0, width - 1)}${ELLIPSIS}`
}

// A filtered list with no rows names the query; an empty list keeps its own message.
export function getNoMatchMessage(query: string, empty: string): string {
  const trimmed = query.trim()

  return trimmed ? `No matches for "${trimmed}"` : empty
}

const NO_MATCHES: readonly number[] = []

// Text cut at the end keeps only the positions before its ellipsis.
export function fitDialogLabelMatches(
  source: string,
  fitted: string,
  indices: readonly number[] | undefined
): readonly number[] {
  if (!indices || indices.length === 0) return NO_MATCHES

  const kept = fitted.length < source.length ? Math.max(0, fitted.length - 1) : fitted.length

  return indices.every(index => index < kept) ? indices : indices.filter(index => index < kept)
}

export function fitDialogRow(label: string, value: string, width: number): DialogRowText {
  const fittedLabel = truncateDialogText(label, width)
  const valueWidth = width - fittedLabel.length - 2

  return {
    label: fittedLabel,
    value: valueWidth > 0 ? truncateDialogText(value, valueWidth) : '',
  }
}
