import type { ReactNode } from 'react'
import { RGBA } from '@opentui/core'
import { getModalStyle, useTheme } from '../styles/theme'
import { getDialogContentWidth, getDialogWidth, truncateDialogText } from './dialog-layout'

const CLOSE_HINT = 'esc'
const DEFAULT_PREFERRED_WIDTH = 76

interface Props {
  title: string
  description?: string
  footer?: string
  columns: number
  preferredWidth?: number
  children: ReactNode
}

export default function Modal({
  title,
  description,
  footer,
  columns,
  preferredWidth = DEFAULT_PREFERRED_WIDTH,
  children,
}: Props) {
  const theme = useTheme()
  const width = getDialogWidth(columns, preferredWidth)
  const contentWidth = getDialogContentWidth(width)

  return (
    <box
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: RGBA.fromInts(0, 0, 0, 150),
      }}
    >
      <box style={{ ...getModalStyle(theme, columns, preferredWidth), width }}>
        <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <text style={{ fg: theme.text }}>
            {truncateDialogText(title, contentWidth - CLOSE_HINT.length - 1)}
          </text>
          <text style={{ fg: theme.textMuted }}>{CLOSE_HINT}</text>
        </box>
        {description && (
          <text style={{ fg: theme.textMuted, marginTop: 1 }}>
            {truncateDialogText(description, contentWidth)}
          </text>
        )}
        <box style={{ flexDirection: 'column', marginTop: 1 }}>{children}</box>
        {footer && (
          <text style={{ fg: theme.textMuted, marginTop: 1 }}>
            {truncateDialogText(footer, contentWidth)}
          </text>
        )}
      </box>
    </box>
  )
}
