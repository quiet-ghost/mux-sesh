import type { ThemeColors } from '../types'

export interface TextFieldColors {
  textColor: string
  focusedTextColor: string
  placeholderColor: string
  cursorColor: string
  selectionBg: string
  selectionFg: string
}

// Every text field spreads these, so the text, the terminal cursor it pushes, and selected text all
// follow the theme; left unset, OpenTUI draws a white cursor that vanishes on light themes.
export function textFieldColors(theme: ThemeColors): TextFieldColors {
  return {
    textColor: theme.text,
    focusedTextColor: theme.text,
    placeholderColor: theme.textMuted,
    cursorColor: theme.text,
    selectionBg: theme.selection,
    selectionFg: theme.selectionText,
  }
}
