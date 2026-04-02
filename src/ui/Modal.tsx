import type { ReactNode } from 'react'
import { RGBA } from '@opentui/core'
import { getModalStyle, useTheme } from '../styles/theme'

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
  preferredWidth,
  children,
}: Props) {
  const theme = useTheme()

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
      <box style={getModalStyle(theme, columns, preferredWidth)}>
        <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <text style={{ fg: theme.text }}>{title}</text>
          <text style={{ fg: theme.textMuted }}>esc</text>
        </box>
        {description && <text style={{ fg: theme.textMuted, marginTop: 1 }}>{description}</text>}
        <box style={{ flexDirection: 'column', marginTop: 1 }}>{children}</box>
        {footer && <text style={{ fg: theme.textMuted, marginTop: 1 }}>{footer}</text>}
      </box>
    </box>
  )
}
