import { TextAttributes } from '@opentui/core'
import { CONFIRM_CLOSE_KEY } from '../app/pending-close'
import type { ThemeColors } from '../styles/theme-model'

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

// The cursor row is highlighted; while its close waits for a second key it takes the danger tint
// instead, and its meta asks for that key.
export type RowHighlight = 'none' | 'selected' | 'closing'

export const CLOSING_META = `${CONFIRM_CLOSE_KEY} again to close`

export function rowHighlight(selected: boolean, closing: boolean): RowHighlight {
  if (closing) return 'closing'

  return selected ? 'selected' : 'none'
}

// The selection highlight wins over the marked tint; the '*' and 'marked' meta still show.
export function rowBackground(
  theme: ThemeColors,
  highlight: RowHighlight,
  marked: boolean
): string {
  switch (highlight) {
    case 'selected':
      return theme.selection
    case 'closing':
      return theme.dangerSurface
    case 'none':
      return marked ? theme.dangerSurface : 'transparent'
  }
}

// Any foreground on the selection highlight becomes the highlight's readable text color.
export function rowForeground(theme: ThemeColors, selected: boolean, color: string): string {
  return selected ? theme.selectionText : color
}
