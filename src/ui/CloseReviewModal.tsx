import { CleanupPlan } from '../sessions/cleanup-plan'
import { useTheme } from '../styles/theme'
import { stripAnsi } from '../util/ansi'
import type { KeyHint } from './key-hints'
import Modal from './Modal'

const CLOSE_REVIEW_HINTS: readonly KeyHint[] = [
  { label: 'close', key: 'enter' },
  { label: 'keep', key: 'esc' },
]

interface Props {
  plan: CleanupPlan
  columns: number
}

// Session names and paths come from the backend; the screen shows plain text.
function plain(text: string): string {
  return stripAnsi(text).replace(/\p{Cc}+/gu, ' ')
}

// One reviewed target: what it is, what closing it removes, and why it may still be in use.
export default function CloseReviewModal({ plan, columns }: Props) {
  const theme = useTheme()

  return (
    <Modal
      title={plain(CleanupPlan.title(plan))}
      description={plain(plan.path)}
      hints={CLOSE_REVIEW_HINTS}
      columns={columns}
    >
      <text style={{ fg: theme.text }}>{CleanupPlan.scope(plan)}</text>
      {plan.warnings.map(warning => (
        <text key={CleanupPlan.describeWarning(warning)} style={{ fg: theme.danger }}>
          {`! ${plain(CleanupPlan.describeWarning(warning))}`}
        </text>
      ))}
      <text style={{ fg: theme.textMuted, marginTop: 1 }}>
        No files, worktrees or branches are deleted.
      </text>
    </Modal>
  )
}
