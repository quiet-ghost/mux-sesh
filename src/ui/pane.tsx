import type { ReactNode } from 'react'

export interface PaneSize {
  width: number
  height: number
}

interface PaneProps {
  title: string
  titleColor: string
  borderColor: string
  // Without a size the pane fills its parent's free space.
  size?: PaneSize
  children: ReactNode
}

// A tmux-style pane: a single-line border with the title set into its top edge, like
// `pane-border-format`. Children sit directly inside the border and lay out in a column.
export function Pane({ title, titleColor, borderColor, size, children }: PaneProps) {
  return (
    <box
      title={` ${title} `}
      titleColor={titleColor}
      style={{
        border: true,
        borderStyle: 'single',
        borderColor,
        flexDirection: 'column',
        ...(size ?? { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 3 }),
      }}
    >
      {children}
    </box>
  )
}

// A rule across a pane, joined to its side borders (`├───┤`). It must be a direct child of the
// pane: it reaches one column past the content on each side to overlay the border.
export function PaneRule({ color }: { color: string }) {
  return (
    <box
      style={{ flexDirection: 'row', flexShrink: 0, height: 1, marginLeft: -1, marginRight: -1 }}
    >
      <text style={{ fg: color, flexShrink: 0 }}>├</text>
      <box
        style={{
          flexGrow: 1,
          height: 1,
          border: ['top'],
          borderStyle: 'single',
          borderColor: color,
        }}
      />
      <text style={{ fg: color, flexShrink: 0 }}>┤</text>
    </box>
  )
}
