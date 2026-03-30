import { useTheme } from '../styles/theme'
import { AppMode, KeybindMode, type Item } from '../types'

interface Props {
  appMode: AppMode
  keybindMode?: KeybindMode
  selectedItem?: Item
}

export default function KeybindHelp({ appMode, keybindMode = 'vim', selectedItem }: Props) {
  const theme = useTheme()
  const isStandard = keybindMode === 'standard'
  const showEditTarget = selectedItem?.itemKind === 'configured' && appMode === AppMode.Normal

  if (appMode === AppMode.Search || appMode === AppMode.NewSession || appMode === AppMode.Rename) {
    if (isStandard) {
      return (
        <>
          <text>
            <span style={{ fg: theme.key }}>↑/↓ </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>navigate</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+X d </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>kill</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+X r </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>rename</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+X n </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>new</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+X o </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>opencode</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+X s </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>settings</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+X l </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>last</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+X g </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>root</span>
          </text>
          {showEditTarget && (
            <text>
              <span style={{ fg: theme.key }}>Ctrl+E </span>
              <span style={{ fg: theme.separator }}>│ </span>
              <span style={{ fg: theme.action }}>edit</span>
            </text>
          )}
          <text>
            <span style={{ fg: theme.key }}>Ctrl+X R </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>refresh</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+Q </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>quit</span>
          </text>
        </>
      )
    }

    return (
      <text>
        <span style={{ fg: theme.key }}>Enter</span>
        <span style={{ fg: theme.separator }}> │ </span>
        <span style={{ fg: theme.action }}>select</span>
        {'  '}
        <span style={{ fg: theme.key }}>↑/↓</span>
        <span style={{ fg: theme.separator }}> │ </span>
        <span style={{ fg: theme.action }}>navigate</span>
        {'  '}
        <span style={{ fg: theme.key }}>Esc</span>
        <span style={{ fg: theme.separator }}> │ </span>
        <span style={{ fg: theme.action }}>cancel</span>
      </text>
    )
  }

  if (appMode === AppMode.OpencodeManage) {
    if (isStandard) {
      return (
        <>
          <text>
            <span style={{ fg: theme.key }}>↑/↓ </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>navigate</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+D </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>kill</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+R </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>rename</span>
          </text>
          <text>
            <span style={{ fg: theme.key }}>Ctrl+O </span>
            <span style={{ fg: theme.separator }}>│ </span>
            <span style={{ fg: theme.action }}>back</span>
          </text>
        </>
      )
    }

    return (
      <>
        <text>
          <span style={{ fg: theme.key }}>j/k </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>navigate</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>d </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>kill</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>r </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>rename</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>o/Esc </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>back</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>, </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>settings</span>
        </text>
      </>
    )
  }

  if (isStandard) {
    return (
      <>
        <text>
          <span style={{ fg: theme.key }}>↑/↓ </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>navigate</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>Ctrl+X d </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>kill</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>Ctrl+X r </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>rename</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>Ctrl+X n </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>new</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>Ctrl+I </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>search</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>Ctrl+X o </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>opencode</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>Ctrl+X s </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>settings</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>Ctrl+L </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>last</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>Ctrl+G </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>root</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>Ctrl+X R </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>refresh</span>
        </text>
        <text>
          <span style={{ fg: theme.key }}>Ctrl+Q </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>quit</span>
        </text>
      </>
    )
  }

  return (
    <>
      <text>
        <span style={{ fg: theme.key }}>j/k </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>navigate</span>
      </text>
      <text>
        <span style={{ fg: theme.key }}>1-9 </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>switch</span>
      </text>
      <text>
        <span style={{ fg: theme.key }}>d </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>kill</span>
      </text>
      <text>
        <span style={{ fg: theme.key }}>r </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>rename</span>
      </text>
      <text>
        <span style={{ fg: theme.key }}>n </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>new</span>
      </text>
      <text>
        <span style={{ fg: theme.key }}>i </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>search</span>
      </text>
      <text>
        <span style={{ fg: theme.key }}>o </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>opencode</span>
      </text>
      <text>
        <span style={{ fg: theme.key }}>, </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>settings</span>
      </text>
      <text>
        <span style={{ fg: theme.key }}>l </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>last</span>
      </text>
      <text>
        <span style={{ fg: theme.key }}>g </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>root</span>
      </text>
      {showEditTarget && (
        <text>
          <span style={{ fg: theme.key }}>e </span>
          <span style={{ fg: theme.separator }}>│ </span>
          <span style={{ fg: theme.action }}>edit</span>
        </text>
      )}
      <text>
        <span style={{ fg: theme.key }}>R </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>refresh</span>
      </text>
      <text>
        <span style={{ fg: theme.key }}>q </span>
        <span style={{ fg: theme.separator }}>│ </span>
        <span style={{ fg: theme.action }}>quit</span>
      </text>
    </>
  )
}
