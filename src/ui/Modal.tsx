import type { ReactNode } from 'react'
import { RGBA } from '@opentui/core'
import { useTheme } from '../styles/theme'
import {
  DEFAULT_DIALOG_WIDTH,
  getDialogContentWidth,
  getDialogTitleWidth,
  getDialogWidth,
  truncateDialogText,
} from './dialog-layout'
import { KeyHint, KeyHints } from './key-hints'
import { Pane, PaneRule } from './pane'

// Dialogs sit on the screen's own surface color, and the screen behind fades toward that color
// rather than black, so the pane meets it flush and only the border marks the pane's edge.
const BACKDROP_OPACITY = 0.7

function backdrop(background: string): RGBA {
  const color = RGBA.fromHex(background)
  color.a = BACKDROP_OPACITY

  return color
}

interface Props {
  title: string
  description?: string
  hints: readonly KeyHint[]
  columns: number
  preferredWidth?: number
  children: ReactNode
}

// Every dialog is a tmux-style popup pane over the dimmed screen: the title in the top border, an
// optional muted description as the first body row, the body, then its key hints under a rule.
// Esc is always one of the hints, so the border carries only the title.
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
        backgroundColor: backdrop(theme.surface),
      }}
    >
      <Pane
        title={truncateDialogText(title, getDialogTitleWidth(width))}
        titleColor={theme.text}
        borderColor={theme.border}
        backgroundColor={theme.surface}
        size={{ width }}
      >
        <box style={{ flexDirection: 'column', paddingLeft: 1, paddingRight: 1 }}>
          {description && (
            <text style={{ fg: theme.textMuted, wrapMode: 'none' }}>
              {truncateDialogText(description, contentWidth)}
            </text>
          )}
          {children}
        </box>
        <PaneRule color={theme.border} />
        <box style={{ paddingLeft: 1, paddingRight: 1 }}>
          <KeyHints hints={KeyHint.fit(hints, contentWidth)} />
        </box>
      </Pane>
    </box>
  )
}
