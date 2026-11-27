import { useMemo, type ReactNode } from 'react'
import { ThemeProvider, useTheme } from '../styles/theme'
import type { ThemeColors } from '../types'
import { DIALOG_INSET_COLUMNS, truncateDialogText } from './dialog-layout'
import { KeyHint, KeyHints } from './key-hints'

// Below this many rows the body drops the blank rows between its blocks.
const ROOMY_ROWS = 24

// The header text sits after the accent bar and one space.
const ACCENT_COLUMNS = 2

// Wider than the gap between hints, so the two footer groups never read as one list.
const GROUP_GAP_COLUMNS = 3

const HEX_COLOR = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i

// Built-in colors for a failure screen that must render even when the theme cannot be read.
const FALLBACK: ThemeColors = {
  background: '#0a0a0a',
  surface: '#141414',
  surfaceAlt: '#1e1e1e',
  surfaceModal: '#1e1e1e',
  overlay: '#000000',
  border: '#3c3c3c',
  borderMuted: '#2a2a2a',
  text: '#eeeeee',
  textMuted: '#808080',
  textSubtle: '#5c5c5c',
  primary: '#61afef',
  secondary: '#c678dd',
  accent: '#56b6c2',
  active: '#7fd88f',
  inactive: '#5c5c5c',
  key: '#e5c07b',
  action: '#61afef',
  separator: '#3c3c3c',
  program: '#98c379',
  fileTree: '#61afef',
  danger: '#e06c75',
  dangerSurface: '#3a1d20',
  selection: '#2c313a',
  selectionText: '#eeeeee',
}

function token(theme: ThemeColors, key: keyof ThemeColors): string {
  try {
    const value = theme[key]

    return HEX_COLOR.test(value) ? value : FALLBACK[key]
  } catch {
    return FALLBACK[key]
  }
}

// Every token is read once, guarded: a throwing or malformed theme falls back per token.
function from(theme: ThemeColors): ThemeColors {
  return {
    background: token(theme, 'background'),
    surface: token(theme, 'surface'),
    surfaceAlt: token(theme, 'surfaceAlt'),
    surfaceModal: token(theme, 'surfaceModal'),
    overlay: token(theme, 'overlay'),
    border: token(theme, 'border'),
    borderMuted: token(theme, 'borderMuted'),
    text: token(theme, 'text'),
    textMuted: token(theme, 'textMuted'),
    textSubtle: token(theme, 'textSubtle'),
    primary: token(theme, 'primary'),
    secondary: token(theme, 'secondary'),
    accent: token(theme, 'accent'),
    active: token(theme, 'active'),
    inactive: token(theme, 'inactive'),
    key: token(theme, 'key'),
    action: token(theme, 'action'),
    separator: token(theme, 'separator'),
    program: token(theme, 'program'),
    fileTree: token(theme, 'fileTree'),
    danger: token(theme, 'danger'),
    dangerSurface: token(theme, 'dangerSurface'),
    selection: token(theme, 'selection'),
    selectionText: token(theme, 'selectionText'),
  }
}

export const FailurePalette = { from, fallback: FALLBACK } as const

export function useFailurePalette(): ThemeColors {
  const theme = useTheme()

  return useMemo(() => FailurePalette.from(theme), [theme])
}

export function isRoomyFailureScreen(rows: number): boolean {
  return rows >= ROOMY_ROWS
}

export type FailureFooterEnd =
  | { readonly kind: 'hints'; readonly hints: readonly KeyHint[] }
  | { readonly kind: 'status'; readonly text: string }

interface Props {
  title: string
  description: string
  hints: readonly KeyHint[]
  end?: FailureFooterEnd
  columns: number
  rows: number
  children: ReactNode
}

function endWidth(end: FailureFooterEnd | undefined): number {
  if (!end) return 0

  return end.kind === 'hints' ? KeyHint.text(end.hints).length : end.text.length
}

// Full-screen chrome for crash and startup failures: a danger accent beside the title and its
// muted description, the body at the dialog inset, and a raised key-hint band at the bottom.
// Children read the guarded palette through the theme context.
export function FailureScreen({ title, description, hints, end, columns, rows, children }: Props) {
  const palette = useFailurePalette()
  const contentWidth = Math.max(1, columns - DIALOG_INSET_COLUMNS * 2)
  const headerWidth = Math.max(1, contentWidth - ACCENT_COLUMNS)
  const trailing = endWidth(end)
  const hintBudget = trailing > 0 ? contentWidth - trailing - GROUP_GAP_COLUMNS : contentWidth

  return (
    <ThemeProvider theme={palette}>
      <box
        style={{
          width: columns,
          height: rows,
          backgroundColor: palette.background,
          flexDirection: 'column',
        }}
      >
        <box
          style={{
            flexDirection: 'column',
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minHeight: 0,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: DIALOG_INSET_COLUMNS,
            paddingRight: DIALOG_INSET_COLUMNS,
          }}
        >
          <box
            style={{
              flexDirection: 'column',
              flexShrink: 0,
              marginBottom: 1,
              paddingLeft: 1,
              border: ['left'],
              borderStyle: 'heavy',
              borderColor: palette.danger,
            }}
          >
            <text style={{ fg: palette.text, wrapMode: 'none' }}>
              <b>{truncateDialogText(title, headerWidth)}</b>
            </text>
            <text style={{ fg: palette.textMuted, wrapMode: 'none' }}>
              {truncateDialogText(description, headerWidth)}
            </text>
          </box>
          <box
            style={{
              flexDirection: 'column',
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
              minHeight: 0,
              gap: isRoomyFailureScreen(rows) ? 1 : 0,
            }}
          >
            {children}
          </box>
        </box>
        <box
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            flexShrink: 0,
            backgroundColor: palette.surfaceAlt,
            paddingLeft: DIALOG_INSET_COLUMNS,
            paddingRight: DIALOG_INSET_COLUMNS,
          }}
        >
          <KeyHints hints={KeyHint.fit(hints, hintBudget)} />
          {end?.kind === 'hints' && <KeyHints hints={end.hints} />}
          {end?.kind === 'status' && (
            <text style={{ fg: palette.textMuted, wrapMode: 'none' }}>{end.text}</text>
          )}
        </box>
      </box>
    </ThemeProvider>
  )
}
