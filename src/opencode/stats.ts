import {
  getActiveOpencodeSession,
  getAggregatedOpencodeStats,
  getMostRecentSessionForDirectory,
} from './session'
import type { OpencodeStats } from './types'
import { getTmuxSessionDirectory } from '../tmux'

export async function getOpencodeSessionStats(
  tmuxSessionName: string
): Promise<OpencodeStats | null> {
  const tmuxDirectory = await getTmuxSessionDirectory(tmuxSessionName)

  const activeSession = await getActiveOpencodeSession(tmuxDirectory)
  if (activeSession) {
    return activeSession
  }

  const homeDir = process.env.HOME || '/home/ghost'
  if (tmuxDirectory === homeDir) {
    return getAggregatedOpencodeStats(tmuxDirectory)
  }

  return getMostRecentSessionForDirectory(tmuxDirectory)
}
