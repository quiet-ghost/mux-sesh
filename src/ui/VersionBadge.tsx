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
