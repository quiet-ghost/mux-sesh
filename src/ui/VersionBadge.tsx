import { useTheme } from '../styles/theme'

interface VersionBadgeProps {
  currentVersion: string
  updatedVersion?: string | null
  isDev?: boolean
}

export function formatVersionBadge(
  currentVersion: string,
  updatedVersion?: string | null,
  isDev = false
): string {
  if (isDev) {
    return 'dev'
  }

  if (updatedVersion && updatedVersion !== currentVersion) {
    return `v${currentVersion} -> v${updatedVersion}`
  }

  return `v${currentVersion}`
}

export default function VersionBadge({
  currentVersion,
  updatedVersion,
  isDev = false,
}: VersionBadgeProps) {
  const theme = useTheme()

  return (
    <box
      style={{
        position: 'absolute',
        bottom: 0,
        right: 1,
      }}
    >
      <text style={{ fg: theme.textSubtle }}>
        {formatVersionBadge(currentVersion, updatedVersion, isDev)}
      </text>
    </box>
  )
}
