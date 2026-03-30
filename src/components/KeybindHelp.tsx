import { colors } from '../styles/theme'
import { AppMode, KeybindMode, type Item } from '../types'

interface Props {
  appMode: AppMode
  keybindMode?: KeybindMode
  selectedItem?: Item
}

export default function KeybindHelp({ appMode, keybindMode = 'vim', selectedItem }: Props) {
  const isStandard = keybindMode === 'standard'
  const showEditTarget = selectedItem?.itemKind === 'configured' && appMode === AppMode.Normal
  if (appMode === AppMode.Search || appMode === AppMode.NewSession || appMode === AppMode.Rename) {
    if (isStandard) {
      // Standard mode: show Ctrl+X prefix keybinds in vertical layout matching vim mode
      return (
        <>
          <text>
            <span style={{ fg: colors.key }}>↑/↓ </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>navigate</span>
          </text>
          <text>
            <span style={{ fg: colors.key }}>Ctrl+X d </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>kill</span>
          </text>
          <text>
            <span style={{ fg: colors.key }}>Ctrl+X r </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>rename</span>
          </text>
          <text>
            <span style={{ fg: colors.key }}>Ctrl+X n </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>new</span>
          </text>
          <text>
            <span style={{ fg: colors.key }}>Ctrl+X o </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>opencode</span>
          </text>
          <text>
            <span style={{ fg: colors.key }}>Ctrl+X l </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>last</span>
          </text>
        <text>
          <span style={{ fg: colors.key }}>Ctrl+X g </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>root</span>
        </text>
          {showEditTarget && (
            <text>
              <span style={{ fg: colors.key }}>Ctrl+E </span>
              <span style={{ fg: colors.separator }}>│ </span>
              <span style={{ fg: colors.action }}>edit</span>
            </text>
          )}
          <text>
            <span style={{ fg: colors.key }}>Ctrl+X R </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>refresh</span>
          </text>
          <text>
            <span style={{ fg: colors.key }}>Ctrl+Q </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>quit</span>
          </text>
        </>
      )
    }
    // Vim mode: simple keybinds
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
    if (isStandard) {
      return (
        <>
          <text>
            <span style={{ fg: colors.key }}>↑/↓ </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>navigate</span>
          </text>
          <text>
            <span style={{ fg: colors.key }}>Ctrl+D </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>kill</span>
          </text>
          <text>
            <span style={{ fg: colors.key }}>Ctrl+R </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>rename</span>
          </text>
          <text>
            <span style={{ fg: colors.key }}>Ctrl+O </span>
            <span style={{ fg: colors.separator }}>│ </span>
            <span style={{ fg: colors.action }}>back</span>
          </text>
        </>
      )
    }
    return (
      <>
        <text>
          <span style={{ fg: colors.key }}>j/k </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>navigate</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>d </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>kill</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>r </span>
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
  if (isStandard) {
    return (
      <>
        <text>
          <span style={{ fg: colors.key }}>↑/↓ </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>navigate</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>Ctrl+X d </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>kill</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>Ctrl+X r </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>rename</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>Ctrl+X n </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>new</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>Ctrl+I </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>search</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>Ctrl+X o </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>opencode</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>Ctrl+L </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>last</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>Ctrl+G </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>root</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>Ctrl+X R </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>refresh</span>
        </text>
        <text>
          <span style={{ fg: colors.key }}>Ctrl+Q </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>quit</span>
        </text>
      </>
    )
  }

  return (
    <>
      <text>
        <span style={{ fg: colors.key }}>j/k </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>navigate</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>1-9 </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>switch</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>d </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>kill</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>r </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>rename</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>n </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>new</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>i </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>search</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>o </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>opencode</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>l </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>last</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>g </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>root</span>
      </text>
      {showEditTarget && (
        <text>
          <span style={{ fg: colors.key }}>e </span>
          <span style={{ fg: colors.separator }}>│ </span>
          <span style={{ fg: colors.action }}>edit</span>
        </text>
      )}
      <text>
        <span style={{ fg: colors.key }}>R </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>refresh</span>
      </text>
      <text>
        <span style={{ fg: colors.key }}>q </span>
        <span style={{ fg: colors.separator }}>│ </span>
        <span style={{ fg: colors.action }}>quit</span>
      </text>
    </>
  )
}
