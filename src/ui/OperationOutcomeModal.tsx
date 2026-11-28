import { OperationReport } from '../app/action-outcome'
import { useTheme } from '../styles/theme'
import { toPlainText } from '../util/ansi'
import Modal from './Modal'

interface Props {
  report: OperationReport
  columns: number
}

// Shows what completed before what failed, so finished work is never read as lost.
export default function OperationOutcomeModal({ report, columns }: Props) {
  const theme = useTheme()
  const retry = OperationReport.retryLabel(report)

  return (
    <Modal
      title={toPlainText(report.title)}
      hints={[
        { label: retry ?? 'close', key: 'enter' },
        { label: 'close', key: 'esc' },
      ]}
      columns={columns}
    >
      {report.completed.map(fact => (
        <text key={fact} style={{ fg: theme.active }}>
          {`✓ ${toPlainText(fact)}`}
        </text>
      ))}
      {report.kind === 'unknown' && (
        <text style={{ fg: theme.text }}>{`… ${toPlainText(report.attempted)}`}</text>
      )}
      <text style={{ fg: theme.danger }}>
        {report.kind === 'partial'
          ? `✗ ${toPlainText(report.failed)}`
          : `? ${toPlainText(report.reason)}`}
      </text>
      <text style={{ fg: theme.textMuted, marginTop: 1 }}>{toPlainText(report.next)}</text>
    </Modal>
  )
}
