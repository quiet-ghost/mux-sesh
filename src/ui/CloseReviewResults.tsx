import { CloseReceipt } from '../sessions/cleanup-batch'
import { useTheme } from '../styles/theme'
import { toPlainText } from '../util/ansi'
import Modal from './Modal'

interface Props {
  receipt: CloseReceipt
  columns: number
}

// One line per reviewed target, so completed closes are never read as lost or retried.
export default function CloseReviewResults({ receipt, columns }: Props) {
  const theme = useTheme()
  const retry = CloseReceipt.retryable(receipt).length

  return (
    <Modal
      title={toPlainText(CloseReceipt.title(receipt))}
      hints={[
        { label: retry > 0 ? `retry ${retry}` : 'close', key: 'enter' },
        { label: 'close', key: 'esc' },
      ]}
      columns={columns}
    >
      {CloseReceipt.lines(receipt).map(line => (
        <text key={line} style={{ fg: line.startsWith('✓') ? theme.active : theme.danger }}>
          {toPlainText(line)}
        </text>
      ))}
      <text style={{ fg: theme.textMuted, marginTop: 1 }}>
        {toPlainText(CloseReceipt.next(receipt))}
      </text>
    </Modal>
  )
}
