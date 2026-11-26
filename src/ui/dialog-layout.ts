const DIALOG_MARGIN_COLUMNS = 2
const DIALOG_MARGIN_ROWS = 1
const DIALOG_PADDING_COLUMNS = 2
const DIALOG_ROW_PADDING_COLUMNS = 1
const MIN_LIST_ROWS = 4
const ELLIPSIS = '…'

export const DIALOG_FILTER_ROWS = 2

export interface DialogChrome {
  description?: string
  footer?: string
}

export interface DialogRowText {
  label: string
  value: string
}

export function getDialogWidth(columns: number, preferredWidth: number): number {
  return Math.max(1, Math.min(preferredWidth, columns - DIALOG_MARGIN_COLUMNS * 2))
}

export function getDialogContentWidth(dialogWidth: number): number {
  return Math.max(1, dialogWidth - DIALOG_PADDING_COLUMNS * 2)
}

export function getDialogRowWidth(dialogWidth: number): number {
  return Math.max(1, getDialogContentWidth(dialogWidth) - DIALOG_ROW_PADDING_COLUMNS * 2)
}

export function getDialogChromeRows({ description, footer }: DialogChrome): number {
  const padding = 2
  const title = 1
  const contentMargin = 1

  return padding + title + contentMargin + (description ? 2 : 0) + (footer ? 2 : 0)
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

export function fitDialogRow(label: string, value: string, width: number): DialogRowText {
  const fittedLabel = truncateDialogText(label, width)
  const valueWidth = width - fittedLabel.length - 2

  return {
    label: fittedLabel,
    value: valueWidth > 0 ? truncateDialogText(value, valueWidth) : '',
  }
}
