import { useMemo, type ReactNode } from 'react'
import type { ToastKind } from '../app/notifications'
import { ThemeProvider, useTheme } from '../styles/theme'
import type { ThemeColors } from '../types'
import { truncateDialogText } from './dialog-layout'
import { GROUP_GAP_COLUMNS, KeyHint, KeyHints } from './key-hints'
import { Pane, PaneRule } from './pane'
import { toastColor } from './notice-kind'

// Below this many rows the body drops the blank rows between its blocks.
const ROOMY_ROWS = 24

// Body text sits one space inside each side border.
const PANE_INSET_COLUMNS = 2

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

function isRoomyFailureScreen(rows: number): boolean {
  return rows >= ROOMY_ROWS
}

export type FailureFooterEnd =
  | { readonly kind: 'hints'; readonly hints: readonly KeyHint[] }
  | { readonly kind: 'status'; readonly text: string }

// A copy or share outcome, shown as one status line above the footer rule.
export interface FailureStatus {
  readonly kind: ToastKind
  readonly text: string
}

const STATUS_WORD: Record<ToastKind, string> = {
  success: 'done',
  warning: 'warning',
  error: 'error',
  info: 'info',
}

interface Props {
  title: string
  description: string
  hints: readonly KeyHint[]
  end?: FailureFooterEnd
  status?: FailureStatus
  columns: number
  rows: number
  children: ReactNode
}

function endWidth(end: FailureFooterEnd | undefined): number {
  if (!end) return 0

  return end.kind === 'hints' ? KeyHint.text(end.hints).length : end.text.length
}

// Full-screen chrome for crash and startup failures: one pane with the title in its top border
// in the danger color, a muted description as the first body row, an optional status line, and a
// footer row of key hints under a rule. Children read the guarded palette through the theme context.
export function FailureScreen({
  title,
  description,
  hints,
  end,
  status,
  columns,
  rows,
  children,
}: Props) {
  const palette = useFailurePalette()
  const contentWidth = Math.max(1, columns - PANE_INSET_COLUMNS * 2)
  const trailing = endWidth(end)
  const hintBudget = trailing > 0 ? contentWidth - trailing - GROUP_GAP_COLUMNS : contentWidth

  return (
    <ThemeProvider theme={palette}>
      <box style={{ width: columns, height: rows, backgroundColor: palette.background }}>
        <Pane
          title={title}
          titleColor={palette.danger}
          borderColor={palette.border}
          size={{ width: columns, height: rows }}
        >
          <box
            style={{
              flexDirection: 'column',
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
              minHeight: 0,
              paddingLeft: 1,
              paddingRight: 1,
              gap: isRoomyFailureScreen(rows) ? 1 : 0,
            }}
          >
            <text style={{ fg: palette.textMuted, wrapMode: 'none', flexShrink: 0 }}>
              {truncateDialogText(description, contentWidth)}
            </text>
            {children}
          </box>
          {status && <StatusLine status={status} />}
          <PaneRule color={palette.border} />
          <box
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              flexShrink: 0,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <KeyHints hints={KeyHint.fit(hints, hintBudget)} />
            {end?.kind === 'hints' && <KeyHints hints={end.hints} />}
            {end?.kind === 'status' && (
              <text style={{ fg: palette.textMuted, wrapMode: 'none' }}>{end.text}</text>
            )}
          </box>
        </Pane>
      </box>
    </ThemeProvider>
  )
}

function StatusLine({ status }: { status: FailureStatus }) {
  const palette = useFailurePalette()

  return (
    <box style={{ flexShrink: 0, paddingLeft: 1, paddingRight: 1 }}>
      <text style={{ fg: palette.text, wrapMode: 'word', width: '100%' }}>
        <span style={{ fg: toastColor(palette, status.kind) }}>{STATUS_WORD[status.kind]}</span>
        {` ${status.text}`}
      </text>
    </box>
  )
}

// The diagnostics report: a nested pane titled in muted text whose body scrolls.
export function FailureSection({ title, children }: { title: string; children: ReactNode }) {
  const palette = useFailurePalette()

  return (
    <Pane title={title} titleColor={palette.textMuted} borderColor={palette.border}>
      {children}
    </Pane>
  )
}
