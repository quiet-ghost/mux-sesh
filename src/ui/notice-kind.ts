import type { ToastKind } from '../app/notifications'
import type { ThemeColors } from '../styles/theme-model'

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

// The word that leads a notice in the status line. Each is at most five letters and starts with
// its own letter, so the kind reads at a glance; `done` names what a confirmation says happened.
export const NOTICE_WORD: Readonly<Record<ToastKind, string>> = {
  info: 'info',
  success: 'done',
  warning: 'warn',
  error: 'error',
}
