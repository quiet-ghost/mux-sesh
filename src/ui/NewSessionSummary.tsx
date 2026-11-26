import type { LaunchPreview } from '../sessions/launch-plan'
import { useTheme } from '../styles/theme'
import { truncateDialogText } from './dialog-layout'
import { describeLaunchPreview } from './launch-preview'

interface Props {
  preview: LaunchPreview
  width: number
}

// One row naming exactly what Enter will do, read from the frozen launch plan.
export default function NewSessionSummary({ preview, width }: Props) {
  const theme = useTheme()
  const summary = describeLaunchPreview(preview)

  if (summary.kind === 'none') return null

  if (summary.kind === 'note') {
    return (
      <text style={{ fg: theme.textMuted, wrapMode: 'none', flexShrink: 0, marginBottom: 1 }}>
        {truncateDialogText(summary.text, width)}
      </text>
    )
  }

  const detail = truncateDialogText(summary.detail, Math.max(1, width - summary.verb.length - 1))

  return (
    <text style={{ wrapMode: 'none', flexShrink: 0, marginBottom: 1 }}>
      <span style={{ fg: theme.action }}>{summary.verb}</span>
      <span style={{ fg: theme.text }}>{` ${detail}`}</span>
    </text>
  )
}
