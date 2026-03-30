import { useTheme } from '../styles/theme'

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
  const theme = useTheme()

  if (totalSessions === 0) return null

  return (
    <>
      <text style={{ marginTop: 1, fg: theme.textMuted }}>
        Sessions: {totalSessions} ({activeSessions} active, {idleSessions} idle)
      </text>
      <text style={{ fg: theme.textSubtle }}>
        Oldest: {oldestSession} Newest: {newestSession}
      </text>
    </>
  )
}
