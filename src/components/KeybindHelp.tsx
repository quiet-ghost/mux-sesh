import { colors } from '../styles/theme'
import { AppMode } from '../types'

interface Props {
  appMode: AppMode
}

export default function KeybindHelp({ appMode }: Props) {
  if (appMode === AppMode.Search || appMode === AppMode.NewSession || appMode === AppMode.Rename) {
    return (
      <text>
        <span style={{ fg: colors.key }}>Enter</span>
        <span style={{ fg: colors.separator }}> │ </span>
        <span style={{ fg: colors.action }}>select</span>
        {'  '}
        <span style={{ fg: colors.key }}>↑/↓</span>
        <span style={{ fg: colors.separator }}> │ </span>
        <span style={{ fg: colors.action }}>navigate</span>
        {'  '}
        <span style={{ fg: colors.key }}>Esc</span>
        <span style={{ fg: colors.separator }}> │ </span>
        <span style={{ fg: colors.action }}>cancel</span>
      </text>
    )
  }

  if (appMode === AppMode.OpencodeManage) {
    return (
      <>
        <text>
          <span style={{ fg: colors.key }}>j/k   </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>navigate</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>d     </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>kill</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>r     </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>rename</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>o/Esc </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>back</span>
        </text>
      </>
    )
  }

  // Single column layout - all keys in left column, all actions in right column
  return (
    <>
      <text>
        <span style={{ fg: colors.key }}>j/k   </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>navigate</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>1-9   </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>switch</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>d     </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>kill</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>r     </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>rename</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>n     </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>new</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>i     </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>search</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>o     </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>opencode</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>R     </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>refresh</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>q     </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>quit</span>
      </text>
    </>
  )
}
