import {
  getTmuxSessionDirectory,
  getActiveOpencodeSession,
  getAggregatedOpencodeStats,
  getMostRecentSessionForDirectory,
} from './session'
import type { OpencodeStats } from './types'

export async function getOpencodeSessionStats(
  tmuxSessionName: string
): Promise<OpencodeStats | null> {
  try {
    const tmuxDirectory = await getTmuxSessionDirectory(tmuxSessionName)
    if (!tmuxDirectory) {
      console.error('Could not determine tmux session directory')
      return null
    }

    const activeSession = await getActiveOpencodeSession(tmuxDirectory)
    if (activeSession) {
      return activeSession
    }

    const homeDir = process.env.HOME || '/home/ghost'
    if (tmuxDirectory === homeDir) {
      return await getAggregatedOpencodeStats(tmuxDirectory)
    }

    return await getMostRecentSessionForDirectory(tmuxDirectory)
  } catch (error) {
    console.error('Failed to get OpenCode session stats:', error)
    return null
  }
}
