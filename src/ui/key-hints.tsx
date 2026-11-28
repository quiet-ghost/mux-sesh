import { Fragment } from 'react'
import { useTheme } from '../styles/theme'

// One footer hint, read as "label key": the label in text color, the key muted.
export interface KeyHint {
  label: string
  key: string
}

export const HINT_GAP = '  '

// Wider than the gap between hints, so two footer groups never read as one list.
export const GROUP_GAP_COLUMNS = 3

function width(hint: KeyHint): number {
  return hint.label.length + 1 + hint.key.length
}

function text(hints: readonly KeyHint[]): string {
  return hints.map(hint => `${hint.label} ${hint.key}`).join(HINT_GAP)
}

// Whole hints only: a cut-off key is worse than a missing one.
function fit(hints: readonly KeyHint[], available: number): KeyHint[] {
  const fitted: KeyHint[] = []
  let used = 0

  for (const hint of hints) {
    const next = used + (fitted.length > 0 ? HINT_GAP.length : 0) + width(hint)

    if (next > available) break
    fitted.push(hint)
    used = next
  }

  return fitted
}

export const KeyHint = { text, fit } as const

interface KeyHintsProps {
  hints: readonly KeyHint[]
}

export function KeyHints({ hints }: KeyHintsProps) {
  const theme = useTheme()

  return (
    <text style={{ wrapMode: 'none' }}>
      {hints.map((hint, index) => (
        <Fragment key={`${hint.label}:${hint.key}`}>
          {index > 0 ? HINT_GAP : null}
          <span style={{ fg: theme.text }}>{hint.label}</span>
          <span style={{ fg: theme.textMuted }}>{` ${hint.key}`}</span>
        </Fragment>
      ))}
    </text>
  )
}
