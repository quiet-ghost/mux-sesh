import { TextAttributes } from '@opentui/core'
import type { ThemeColors } from '../types'

export const SELECTION_BAR = '┃'

// Matched characters on the highlighted row share its text color, so they are underlined instead.
export const SELECTED_MATCH_ATTRIBUTES = TextAttributes.UNDERLINE | TextAttributes.BOLD

// The 1-cell gutter left of every row: the accent bar on the selected row, blank otherwise.
export function rowGutter(selected: boolean): string {
  return selected ? SELECTION_BAR : ' '
}

// Every list shows a marked row the same way: '*' after the gutter and 'marked' in its meta,
// so a row under the cursor still reads as marked.
export function rowMarker(marked: boolean): string {
  return marked ? '* ' : '  '
}

export function markedMeta(marked: boolean, meta: string): string {
  if (!marked) return meta

  return meta ? `marked  ${meta}` : 'marked'
}

// The selection highlight wins over the marked tint; the '*' and 'marked' meta still show.
export function rowBackground(theme: ThemeColors, selected: boolean, marked: boolean): string {
  if (selected) return theme.selection

  return marked ? theme.dangerSurface : 'transparent'
}

// Any foreground on the selection highlight becomes the highlight's readable text color.
export function rowForeground(theme: ThemeColors, selected: boolean, color: string): string {
  return selected ? theme.selectionText : color
}
