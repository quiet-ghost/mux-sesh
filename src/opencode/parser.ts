import type { OpencodeStats } from './types'
import { getGlobalStats } from './sqlite'

function formatTokenCount(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

export async function getGlobalOpencodeStats(): Promise<OpencodeStats> {
  const stats = await getGlobalStats()

  const totalCost = stats.totalCost
  const oldestCreatedAt = stats.oldestCreatedAt ?? Date.now()
  const newestUpdatedAt = stats.newestUpdatedAt ?? oldestCreatedAt
  const daySpan = Math.max(1, Math.ceil((newestUpdatedAt - oldestCreatedAt) / 86_400_000))
  const costPerDay = totalCost / daySpan

  return {
    totalSessions: stats.totalSessions,
    totalMessages: stats.totalMessages,
    totalCost: `$${totalCost.toFixed(2)}`,
    costPerDay: `$${costPerDay.toFixed(2)}`,
    inputTokens: formatTokenCount(stats.inputTokens),
    outputTokens: formatTokenCount(stats.outputTokens),
    cacheRead: formatTokenCount(stats.cacheRead),
    cacheWrite: formatTokenCount(stats.cacheWrite),
  }
}
