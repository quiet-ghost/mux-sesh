import { TextAttributes } from '@opentui/core'
import type { ThemeColors } from '../types'

// Matched characters on the highlighted row share its text color, so they are underlined instead.
export const SELECTED_MATCH_ATTRIBUTES = TextAttributes.UNDERLINE | TextAttributes.BOLD

// Every list shows a marked row the same way: '*' in the row's first cell and 'marked' in its meta,
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
