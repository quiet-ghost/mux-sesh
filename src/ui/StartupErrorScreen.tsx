import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import type { StartupFailureStage, StartupState } from '../app/state'
import { useTheme } from '../styles/theme'

interface Props {
  startup: Extract<StartupState, { kind: 'failed' | 'retrying' }>
  onRetry: () => void
  onQuit: () => void
}

const STAGE_LABEL: Record<StartupFailureStage, string> = {
  config: 'Configuration',
  backend: 'Multiplexer backend',
  inventory: 'Session list',
}

const STAGE_HINT: Record<StartupFailureStage, string> = {
  config: 'Fix the config file, then retry. It was not overwritten.',
  backend: 'Start or update the backend, then retry. mux-sesh never starts or switches it for you.',
  inventory: 'Check the backend is responding, then retry.',
}

export function StartupErrorScreen({ startup, onRetry, onQuit }: Props) {
  const theme = useTheme()
  const { width, height } = useTerminalDimensions()
  const { failure } = startup

  useKeyboard(key => {
    if ((key.ctrl && key.name === 'c') || key.name === 'q' || key.name === 'escape') onQuit()
    else if (key.name === 'r' && startup.kind === 'failed') onRetry()
  })

  return (
    <box
      style={{
        width,
        height,
        backgroundColor: theme.background,
        flexDirection: 'column',
        paddingTop: 1,
        paddingLeft: 2,
        paddingRight: 2,
        gap: 1,
      }}
    >
      <text style={{ fg: theme.text }}>mux-sesh could not start</text>
      <text style={{ fg: theme.textSubtle }}>{STAGE_LABEL[failure.stage]}</text>
      <text style={{ fg: theme.action }}>{failure.message}</text>
      <text style={{ fg: theme.textMuted }}>{STAGE_HINT[failure.stage]}</text>
      <text style={{ fg: theme.textSubtle }}>
        {startup.kind === 'retrying' ? 'Retrying…' : 'r retry · q/esc/ctrl+c quit'}
      </text>
    </box>
  )
}
