import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import type { StartupFailureStage, StartupState } from '../app/startup'
import { FailureScreen, useFailurePalette } from './failure-screen'
import type { KeyHint } from './key-hints'

interface Props {
  startup: Extract<StartupState, { kind: 'failed' | 'retrying' }>
  onRetry: () => void
  onQuit: () => void
}

const STAGE_DESCRIPTION: Record<StartupFailureStage, string> = {
  config: 'Configuration could not be loaded',
  backend: 'Multiplexer backend is unavailable',
  inventory: 'Session list could not be read',
}

const STAGE_HINT: Record<StartupFailureStage, string> = {
  config: 'Fix the config file, then retry. It was not overwritten.',
  backend: 'Start or update the backend, then retry. mux-sesh never starts or switches it for you.',
  inventory: 'Check the backend is responding, then retry.',
}

const QUIT: KeyHint = { label: 'quit', key: 'q' }
const HINTS: readonly KeyHint[] = [{ label: 'retry', key: 'r' }, QUIT]
const RETRYING_HINTS: readonly KeyHint[] = [QUIT]

export function StartupErrorScreen({ startup, onRetry, onQuit }: Props) {
  const theme = useFailurePalette()
  const { width, height } = useTerminalDimensions()
  const { failure } = startup
  const retrying = startup.kind === 'retrying'

  useKeyboard(key => {
    if ((key.ctrl && key.name === 'c') || key.name === 'q' || key.name === 'escape') onQuit()
    else if (key.name === 'r' && startup.kind === 'failed') onRetry()
  })

  return (
    <FailureScreen
      title="mux-sesh could not start"
      description={STAGE_DESCRIPTION[failure.stage]}
      hints={retrying ? RETRYING_HINTS : HINTS}
      end={retrying ? { kind: 'status', text: 'Retrying…' } : undefined}
      columns={width}
      rows={height}
    >
      <text style={{ fg: theme.text, flexShrink: 0 }}>{failure.message}</text>
      <text style={{ fg: theme.textMuted, flexShrink: 0 }}>{STAGE_HINT[failure.stage]}</text>
    </FailureScreen>
  )
}
