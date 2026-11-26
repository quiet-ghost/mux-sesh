import { OperationReport } from '../app/action-outcome'
import { useTheme } from '../styles/theme'
import { stripAnsi } from '../util/ansi'
import Modal from './Modal'

interface Props {
  report: OperationReport
  columns: number
}

// Backend text can carry terminal escapes and control characters; the screen shows plain text.
function plain(text: string): string {
  return stripAnsi(text).replace(/\p{Cc}+/gu, ' ')
}

// Shows what completed before what failed, so finished work is never read as lost.
export default function OperationOutcomeModal({ report, columns }: Props) {
  const theme = useTheme()
  const retry = OperationReport.retryLabel(report)

  return (
    <Modal
      title={plain(report.title)}
      footer={retry ? `enter ${retry}  esc close` : 'enter close  esc close'}
      columns={columns}
    >
      {report.completed.map(fact => (
        <text key={fact} style={{ fg: theme.active }}>
          {`✓ ${plain(fact)}`}
        </text>
      ))}
      {report.kind === 'unknown' && (
        <text style={{ fg: theme.text }}>{`… ${plain(report.attempted)}`}</text>
      )}
      <text style={{ fg: theme.danger }}>
        {report.kind === 'partial' ? `✗ ${plain(report.failed)}` : `? ${plain(report.reason)}`}
      </text>
      <text style={{ fg: theme.textMuted, marginTop: 1 }}>{plain(report.next)}</text>
    </Modal>
  )
}
