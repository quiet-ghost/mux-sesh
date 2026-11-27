import { CleanupBatch } from '../sessions/cleanup-batch'
import { CleanupPlan } from '../sessions/cleanup-plan'
import { useTheme } from '../styles/theme'
import { stripAnsi } from '../util/ansi'
import { toHomeRelativePath } from '../util/path-display'
import { truncatePathInText } from '../util/truncate'
import { DEFAULT_DIALOG_WIDTH, getDialogContentWidth, getDialogWidth } from './dialog-layout'
import Modal from './Modal'

interface Props {
  batch: CleanupBatch
  columns: number
}

// Session names and paths come from the backend; the screen shows plain text.
function plain(text: string): string {
  return stripAnsi(text).replace(/\p{Cc}+/gu, ' ')
}

// A long path gives up its middle first, so the title and what closes stay readable.
function targetLine(plan: CleanupPlan, width: number): string {
  const path = toHomeRelativePath(plain(plan.path))

  return truncatePathInText(
    `'${plain(plan.ref.title)}'  ${path}  ${CleanupPlan.unitsLabel(plan)}`,
    path,
    width
  )
}

// Every marked target as reviewed: what closes, why it may still be in use, and what is refused.
export default function CloseReviewBatch({ batch, columns }: Props) {
  const theme = useTheme()
  const ready = CleanupBatch.readyPlans(batch)
  const hostWarning = CleanupBatch.hostWarning(batch)
  const lineWidth = getDialogContentWidth(getDialogWidth(columns, DEFAULT_DIALOG_WIDTH))

  return (
    <Modal
      tone="danger"
      title={plain(CleanupBatch.title(batch))}
      hints={[
        { label: `close ${ready.length}`, key: 'enter' },
        { label: 'keep', key: 'esc' },
      ]}
      columns={columns}
    >
      {ready.map(plan => (
        <box key={plan.key} style={{ flexDirection: 'column' }}>
          <text style={{ fg: theme.text }}>{targetLine(plan, lineWidth)}</text>
          {plan.warnings.map(warning => (
            <text key={CleanupPlan.describeWarning(warning)} style={{ fg: theme.danger }}>
              {`  ! ${plain(CleanupPlan.describeWarning(warning))}`}
            </text>
          ))}
        </box>
      ))}
      {CleanupBatch.refusedMembers(batch).map(member => (
        <text key={member.key} style={{ fg: theme.danger }}>
          {plain(CleanupBatch.refusedLine(member))}
        </text>
      ))}
      {hostWarning && <text style={{ fg: theme.danger }}>{`! ${plain(hostWarning)}`}</text>}
      <text style={{ fg: theme.textMuted, marginTop: 1 }}>
        Only these are closed. No files, worktrees or branches are deleted.
      </text>
    </Modal>
  )
}
