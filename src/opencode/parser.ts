import { spawn } from 'bun'
import type { OpencodeStats } from './types'

export async function getGlobalOpencodeStats(): Promise<OpencodeStats> {
  try {
    const proc = spawn(['opencode', 'stats'])
    const output = await new Response(proc.stdout).text()

    const stats: OpencodeStats = {}

    const lines = output.split('\n')

    for (const line of lines) {
      if (line.includes('Sessions') && !line.includes('Opencode')) {
        const match = line.match(/Sessions\s+(\d+)/)
        if (match) stats.totalSessions = parseInt(match[1], 10)
      }
      if (line.includes('Messages')) {
        const match = line.match(/Messages\s+([\d,]+)/)
        if (match) stats.totalMessages = parseInt(match[1].replace(/,/g, ''), 10)
      }

      if (line.includes('Total Cost')) {
        const match = line.match(/Total Cost\s+\$?([\d.]+)/)
        if (match) stats.totalCost = `$${match[1]}`
      }
      if (line.includes('Cost/Day')) {
        const match = line.match(/Cost\/Day\s+\$?([\d.]+)/)
        if (match) stats.costPerDay = `$${match[1]}`
      }
      if (line.includes('Input') && !line.includes('Cost')) {
        const match = line.match(/Input\s+([\d.]+[KMG]?)/)
        if (match) stats.inputTokens = match[1]
      }
      if (line.includes('Output')) {
        const match = line.match(/Output\s+([\d.]+[KMG]?)/)
        if (match) stats.outputTokens = match[1]
      }
      if (line.includes('Cache Read')) {
        const match = line.match(/Cache Read\s+([\d.]+[KMG]?)/)
        if (match) stats.cacheRead = match[1]
      }
      if (line.includes('Cache Write')) {
        const match = line.match(/Cache Write\s+([\d.]+[KMG]?)/)
        if (match) stats.cacheWrite = match[1]
      }
    }

    return stats
  } catch (error) {
    console.error('Failed to get global OpenCode stats:', error)
    return {}
  }
}
