import { CleanupBatch } from '../sessions/cleanup-batch'
import { CleanupPlan } from '../sessions/cleanup-plan'
import { useTheme } from '../styles/theme'
import { stripAnsi } from '../util/ansi'
import { fitPath } from '../util/path-display'
import { displayWidth } from '../util/truncate'
import {
  DEFAULT_DIALOG_WIDTH,
  getDialogContentWidth,
  getDialogWidth,
  truncateDialogText,
} from './dialog-layout'
import Modal from './Modal'

interface Props {
  batch: CleanupBatch
  columns: number
}

// Session names and paths come from the backend; the screen shows plain text.
function plain(text: string): string {
  return stripAnsi(text).replace(/\p{Cc}+/gu, ' ')
}

const COLUMN_GAP = '  '

// Names never take more than this share of a row, so every path keeps some room.
const MAX_NAME_SHARE = 0.4

function padEnd(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)))
}

function padStart(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - displayWidth(text))) + text
}

interface TargetColumns {
  readonly name: number
  readonly path: number
  readonly units: number
}

// Name, path and what closes line up across targets; a long path gives up its middle first.
function targetColumns(plans: readonly CleanupPlan[], width: number): TargetColumns {
  const widest = (texts: readonly string[]) => Math.max(0, ...texts.map(displayWidth))
  const units = widest(plans.map(CleanupPlan.unitsLabel))

  const name = Math.min(
    widest(plans.map(plan => plain(plan.ref.title))),
    Math.floor(width * MAX_NAME_SHARE)
  )

  return { name, units, path: Math.max(1, width - name - units - COLUMN_GAP.length * 2) }
}

// Every marked target as reviewed: what closes, why it may still be in use, and what is refused.
export default function CloseReviewBatch({ batch, columns }: Props) {
  const theme = useTheme()
  const ready = CleanupBatch.readyPlans(batch)
  const hostWarning = CleanupBatch.hostWarning(batch)
  const lineWidth = getDialogContentWidth(getDialogWidth(columns, DEFAULT_DIALOG_WIDTH))
  const widths = targetColumns(ready, lineWidth)

  return (
    <Modal
      title={plain(CleanupBatch.title(batch))}
      hints={[
        { label: `close ${ready.length}`, key: 'enter' },
        { label: 'keep', key: 'esc' },
      ]}
      columns={columns}
    >
      {ready.map(plan => (
        <box key={plan.key} style={{ flexDirection: 'column' }}>
          <text style={{ wrapMode: 'none' }}>
            <span style={{ fg: theme.text }}>
              {padEnd(truncateDialogText(plain(plan.ref.title), widths.name), widths.name)}
            </span>
            <span style={{ fg: theme.textMuted }}>
              {COLUMN_GAP + padEnd(fitPath(plain(plan.path), widths.path), widths.path)}
            </span>
            <span style={{ fg: theme.textMuted }}>
              {COLUMN_GAP + padStart(CleanupPlan.unitsLabel(plan), widths.units)}
            </span>
          </text>
          {plan.warnings.map(warning => (
            <text key={CleanupPlan.describeWarning(warning)} style={{ fg: theme.key }}>
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
        No files, worktrees or branches are deleted.
      </text>
    </Modal>
  )
}
