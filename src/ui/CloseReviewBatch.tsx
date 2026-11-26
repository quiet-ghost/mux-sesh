import { CleanupBatch } from '../sessions/cleanup-batch'
import { CleanupPlan } from '../sessions/cleanup-plan'
import { useTheme } from '../styles/theme'
import { stripAnsi } from '../util/ansi'
import Modal from './Modal'

interface Props {
  batch: CleanupBatch
  columns: number
}

// Session names and paths come from the backend; the screen shows plain text.
function plain(text: string): string {
  return stripAnsi(text).replace(/\p{Cc}+/gu, ' ')
}

// Every marked target as reviewed: what closes, why it may still be in use, and what is refused.
export default function CloseReviewBatch({ batch, columns }: Props) {
  const theme = useTheme()
  const ready = CleanupBatch.readyPlans(batch)
  const hostWarning = CleanupBatch.hostWarning(batch)

  return (
    <Modal
      title={plain(CleanupBatch.title(batch))}
      footer={`enter close ${ready.length}  esc keep`}
      columns={columns}
    >
      {ready.map(plan => (
        <box key={plan.key} style={{ flexDirection: 'column' }}>
          <text style={{ fg: theme.text }}>
            {plain(`'${plan.ref.title}'  ${plan.path}  ${CleanupPlan.unitsLabel(plan)}`)}
          </text>
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
