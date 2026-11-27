import type { ReactNode } from 'react'
import { RGBA } from '@opentui/core'
import { useTheme } from '../styles/theme'
import {
  DEFAULT_DIALOG_WIDTH,
  DIALOG_INSET_COLUMNS,
  getDialogContentWidth,
  getDialogWidth,
  truncateDialogText,
} from './dialog-layout'
import { KeyHint, KeyHints } from './key-hints'

const CLOSE_HINT = 'esc'

interface Props {
  title: string
  description?: string
  hints: readonly KeyHint[]
  columns: number
  preferredWidth?: number
  children: ReactNode
}

// Every dialog: title with a muted esc, an optional muted description, the body between blank
// rows, and its own key hints on a raised band that runs edge to edge.
export default function Modal({
  title,
  description,
  hints,
  columns,
  preferredWidth = DEFAULT_DIALOG_WIDTH,
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
      <box
        style={{
          backgroundColor: theme.surfaceModal,
          width,
          paddingTop: 1,
          flexDirection: 'column',
        }}
      >
        <box
          style={{
            flexDirection: 'column',
            paddingLeft: DIALOG_INSET_COLUMNS,
            paddingRight: DIALOG_INSET_COLUMNS,
          }}
        >
          <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <text style={{ fg: theme.text, wrapMode: 'none' }}>
              {truncateDialogText(title, contentWidth - CLOSE_HINT.length - 1)}
            </text>
            <text style={{ fg: theme.textMuted, wrapMode: 'none' }}>{CLOSE_HINT}</text>
          </box>
          {description && (
            <text style={{ fg: theme.textMuted, wrapMode: 'none' }}>
              {truncateDialogText(description, contentWidth)}
            </text>
          )}
          <box style={{ flexDirection: 'column', marginTop: 1, marginBottom: 1 }}>{children}</box>
        </box>
        <box
          style={{
            backgroundColor: theme.surfaceAlt,
            paddingLeft: DIALOG_INSET_COLUMNS,
            paddingRight: DIALOG_INSET_COLUMNS,
          }}
        >
          <KeyHints hints={KeyHint.fit(hints, contentWidth)} />
        </box>
      </box>
    </box>
  )
}
