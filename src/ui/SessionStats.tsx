import { colors } from '../styles/theme'

interface Props {
  totalSessions: number
  activeSessions: number
  idleSessions: number
  oldestSession: string
  newestSession: string
}

export default function SessionStats({
  totalSessions,
  activeSessions,
  idleSessions,
  oldestSession,
  newestSession,
}: Props) {
  if (totalSessions === 0) return null

  return (
    <>
      <text style={{ marginTop: 2, fg: colors.text }}>
        Sessions: {totalSessions} ({activeSessions} active, {idleSessions} idle)
      </text>
      <text style={{ fg: colors.text }}>
        Oldest: {oldestSession} Newest: {newestSession}
      </text>
    </>
  )
}
