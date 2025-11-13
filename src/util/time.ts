export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return 'just now'
  }

  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)

  if (weeks > 0) {
    const remainingDays = days % 7
    if (remainingDays > 0) {
      return `${weeks}w ${remainingDays}d`
    }
    return `${weeks}w`
  }

  if (days > 0) {
    const remainingHours = hours % 24
    if (remainingHours > 0) {
      return `${days}d ${remainingHours}h`
    }
    return `${days}d`
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`
    }
    return `${hours}h`
  }

  return `${minutes}m`
}

export function formatSessionAge(createdTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const age = now - createdTimestamp
  return formatDuration(age)
}

export function formatLastActivity(activityTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const timeSince = now - activityTimestamp
  return formatDuration(timeSince)
}
