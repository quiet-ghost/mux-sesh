import type { LaunchPlan, LaunchPreview } from '../sessions/launch-plan'
import { useTheme } from '../styles/theme'
import { toHomeRelativePath } from '../util/path-display'
import { truncatePathInText } from '../util/truncate'
import { describeLaunchPreview } from './launch-preview'

interface Props {
  preview: LaunchPreview
  width: number
}

function planPath(plan: LaunchPlan): string {
  switch (plan.kind) {
    case 'focus':
      return plan.path
    case 'create':
      return plan.input.path
    case 'clone':
      return plan.clone.destination
  }
}

// The directory the summary names, as describeLaunchPreview writes it; empty when it names none.
function summaryPath(preview: LaunchPreview): string {
  switch (preview.kind) {
    case 'name-required':
      return toHomeRelativePath(preview.directory)
    case 'ready':
      return toHomeRelativePath(planPath(preview.plan))
    case 'inactive':
    case 'no-candidates':
    case 'no-match':
    case 'file-prompt':
    case 'file-searching':
    case 'file-unavailable':
    case 'no-file-match':
    case 'planning':
    case 'refused':
      return ''
  }
}

// One row naming exactly what Enter will do, read from the frozen launch plan.
export default function NewSessionSummary({ preview, width }: Props) {
  const theme = useTheme()
  const summary = describeLaunchPreview(preview)
  const path = summaryPath(preview)

  if (summary.kind === 'none') return null

  if (summary.kind === 'note') {
    return (
      <text style={{ fg: theme.textMuted, wrapMode: 'none', flexShrink: 0, marginBottom: 1 }}>
        {truncatePathInText(summary.text, path, width)}
      </text>
    )
  }

  const detail = truncatePathInText(
    summary.detail,
    path,
    Math.max(1, width - summary.verb.length - 1)
  )

  return (
    <text style={{ wrapMode: 'none', flexShrink: 0, marginBottom: 1 }}>
      <span style={{ fg: theme.action }}>{summary.verb}</span>
      <span style={{ fg: theme.text }}>{` ${detail}`}</span>
    </text>
  )
}
