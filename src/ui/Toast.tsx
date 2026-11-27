import type { QueuedToast, ToastKind } from '../app/notifications'
import { useTheme } from '../styles/theme'
import type { ThemeColors } from '../types'

const MAX_WIDTH_COLUMNS = 60
const SCREEN_MARGIN_COLUMNS = 6
const RIGHT_MARGIN_COLUMNS = 2

interface ToastProps {
  toast: QueuedToast | undefined
  more: number
  // The width of the column the card sits in, anchored to its right edge.
  columns: number
  // Columns to the right of that column (e.g. the details panel) that the card keeps clear of.
  reservedRight?: number
}

// The theme has no warning token; `key` is the palette's warning color.
export function toastColor(theme: ThemeColors, kind: ToastKind): string {
  switch (kind) {
    case 'info':
      return theme.primary
    case 'success':
      return theme.active
    case 'warning':
      return theme.key
    case 'error':
      return theme.danger
  }
}

export default function Toast({ toast, more, columns, reservedRight = 0 }: ToastProps) {
  const theme = useTheme()

  if (!toast) return null

  return (
    <box
      style={{
        position: 'absolute',
        top: 1,
        right: reservedRight + RIGHT_MARGIN_COLUMNS,
        maxWidth: Math.max(1, Math.min(MAX_WIDTH_COLUMNS, columns - SCREEN_MARGIN_COLUMNS)),
        flexDirection: 'column',
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 1,
        paddingBottom: 1,
        backgroundColor: theme.surfaceAlt,
        border: ['left', 'right'],
        borderStyle: 'heavy',
        borderColor: toastColor(theme, toast.kind),
      }}
    >
      {toast.title && (
        <text style={{ fg: theme.text, marginBottom: 1 }}>
          <b>{toast.title}</b>
        </text>
      )}
      <text style={{ fg: theme.text, wrapMode: 'word', width: '100%' }}>{toast.message}</text>
      {more > 0 && <text style={{ fg: theme.textMuted }}>{`+${more} more`}</text>}
    </box>
  )
}
