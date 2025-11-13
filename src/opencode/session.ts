import { spawn } from 'bun'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { SESSION_STORAGE, MESSAGE_STORAGE } from './constants'
import { getLastMessageTokens } from './tokens'
import type { OpencodeStats } from './types'

export async function getTmuxSessionDirectory(sessionName: string): Promise<string> {
  try {
    const proc = spawn(['tmux', 'display-message', '-t', sessionName, '-p', '#{pane_current_path}'])
    const output = await new Response(proc.stdout).text()
    return output.trim()
  } catch (error) {
    console.error('Failed to get tmux session directory:', error)
    return ''
  }
}

export async function getMessageCount(sessionID: string): Promise<number> {
  try {
    if (!sessionID) return 0

    const messageDir = join(MESSAGE_STORAGE, sessionID)
    const messageFiles = await readdir(messageDir).catch(() => [])

    return messageFiles.filter(file => file.endsWith('.json')).length
  } catch (error) {
    console.error('Failed to get message count:', error)
    return 0
  }
}

export async function getAggregatedMessageCount(directory: string): Promise<number> {
  try {
    const projectDirs = await readdir(SESSION_STORAGE)
    let totalMessages = 0

    for (const projectID of projectDirs) {
      const projectPath = join(SESSION_STORAGE, projectID)

      try {
        const sessionFiles = await readdir(projectPath)

        for (const sessionFile of sessionFiles) {
          if (!sessionFile.endsWith('.json')) continue

          const sessionPath = join(projectPath, sessionFile)
          const content = await readFile(sessionPath, 'utf-8')
          const sessionData = JSON.parse(content)

          if (sessionData.directory === directory) {
            totalMessages += await getMessageCount(sessionData.id)
          }
        }
      } catch (err) {
        continue
      }
    }

    return totalMessages
  } catch (error) {
    console.error('Failed to get aggregated message count:', error)
    return 0
  }
}

export async function getActiveOpencodeSession(directory: string): Promise<OpencodeStats | null> {
  try {
    const projectDirs = await readdir(SESSION_STORAGE)
    const now = Date.now()
    const fiveMinutesAgo = now - 5 * 60 * 1000

    let mostRecentActive: OpencodeStats | null = null
    let latestTime = 0

    for (const projectID of projectDirs) {
      const projectPath = join(SESSION_STORAGE, projectID)

      try {
        const sessionFiles = await readdir(projectPath)

        for (const sessionFile of sessionFiles) {
          if (!sessionFile.endsWith('.json')) continue

          const sessionPath = join(projectPath, sessionFile)
          const content = await readFile(sessionPath, 'utf-8')
          const sessionData = JSON.parse(content)

          if (sessionData.directory === directory) {
            const updatedAt = sessionData.time?.updated || sessionData.time?.created || 0

            if (updatedAt >= fiveMinutesAgo && updatedAt > latestTime) {
              latestTime = updatedAt
              const lastMessageData = await getLastMessageTokens(sessionData.id)
              mostRecentActive = {
                sessionID: sessionData.id,
                title: sessionData.title,
                projectID,
                directory: sessionData.directory,
                messageCount: await getMessageCount(sessionData.id),
                filesModified: sessionData.summary?.files || 0,
                additions: sessionData.summary?.additions || 0,
                deletions: sessionData.summary?.deletions || 0,
                createdAt: sessionData.time?.created,
                updatedAt: sessionData.time?.updated,
                lastMessageTokens: lastMessageData?.lastMessageTokens,
                contextLimit: lastMessageData?.contextLimit,
                sessionTotalCost: lastMessageData?.totalCost,
              }
            }
          }
        }
      } catch (err) {
        continue
      }
    }

    return mostRecentActive
  } catch (error) {
    console.error('Failed to get active OpenCode session:', error)
    return null
  }
}

export async function getAggregatedOpencodeStats(directory: string): Promise<OpencodeStats | null> {
  try {
    const projectDirs = await readdir(SESSION_STORAGE)

    let totalSessions = 0
    let totalFiles = 0
    let totalAdditions = 0
    let totalDeletions = 0
    let oldestTime = Date.now()
    let newestTime = 0
    let mostRecentSession: any = null

    for (const projectID of projectDirs) {
      const projectPath = join(SESSION_STORAGE, projectID)

      try {
        const sessionFiles = await readdir(projectPath)

        for (const sessionFile of sessionFiles) {
          if (!sessionFile.endsWith('.json')) continue

          const sessionPath = join(projectPath, sessionFile)
          const content = await readFile(sessionPath, 'utf-8')
          const sessionData = JSON.parse(content)

          if (sessionData.directory === directory) {
            totalSessions++
            totalFiles += sessionData.summary?.files || 0
            totalAdditions += sessionData.summary?.additions || 0
            totalDeletions += sessionData.summary?.deletions || 0

            const createdAt = sessionData.time?.created || 0
            const updatedAt = sessionData.time?.updated || sessionData.time?.created || 0

            if (createdAt < oldestTime) oldestTime = createdAt
            if (updatedAt > newestTime) {
              newestTime = updatedAt
              mostRecentSession = sessionData
            }
          }
        }
      } catch (err) {
        continue
      }
    }

    if (totalSessions === 0) return null

    return {
      title: `Global OpenCode Sessions (${totalSessions} total)`,
      directory,
      messageCount: await getAggregatedMessageCount(directory),
      filesModified: totalFiles,
      additions: totalAdditions,
      deletions: totalDeletions,
      createdAt: oldestTime,
      updatedAt: newestTime,
      sessionCount: totalSessions,
      mostRecentTitle: mostRecentSession?.title || 'Unknown',
    }
  } catch (error) {
    console.error('Failed to get aggregated OpenCode stats:', error)
    return null
  }
}

export async function getMostRecentSessionForDirectory(
  directory: string
): Promise<OpencodeStats | null> {
  try {
    const projectDirs = await readdir(SESSION_STORAGE)

    let mostRecent: OpencodeStats | null = null
    let latestTime = 0

    for (const projectID of projectDirs) {
      const projectPath = join(SESSION_STORAGE, projectID)

      try {
        const sessionFiles = await readdir(projectPath)

        for (const sessionFile of sessionFiles) {
          if (!sessionFile.endsWith('.json')) continue

          const sessionPath = join(projectPath, sessionFile)
          const content = await readFile(sessionPath, 'utf-8')
          const sessionData = JSON.parse(content)

          if (sessionData.directory === directory) {
            const updatedAt = sessionData.time?.updated || sessionData.time?.created || 0

            if (updatedAt > latestTime) {
              latestTime = updatedAt
              const lastMessageData = await getLastMessageTokens(sessionData.id)
              mostRecent = {
                sessionID: sessionData.id,
                title: sessionData.title,
                projectID,
                directory: sessionData.directory,
                messageCount: await getMessageCount(sessionData.id),
                filesModified: sessionData.summary?.files || 0,
                additions: sessionData.summary?.additions || 0,
                deletions: sessionData.summary?.deletions || 0,
                createdAt: sessionData.time?.created,
                updatedAt: sessionData.time?.updated,
                lastMessageTokens: lastMessageData?.lastMessageTokens,
                contextLimit: lastMessageData?.contextLimit,
                sessionTotalCost: lastMessageData?.totalCost,
              }
            }
          }
        }
      } catch (err) {
        continue
      }
    }

    return mostRecent
  } catch (error) {
    console.error('Failed to get most recent session for directory:', error)
    return null
  }
}

export async function getDetailedSessionStats(sessionID: string): Promise<OpencodeStats | null> {
  try {
    const proc = spawn(['opencode', 'export', sessionID])
    const output = await new Response(proc.stdout).text()

    const jsonStart = output.indexOf('{')
    if (jsonStart === -1) return null

    const jsonData = output.slice(jsonStart)
    const data = JSON.parse(jsonData)

    const messageCount = data.messages?.length || 0

    return {
      sessionID: data.info?.id,
      title: data.info?.title,
      projectID: data.info?.projectID,
      directory: data.info?.directory,
      messageCount,
      filesModified: data.info?.summary?.files || 0,
      additions: data.info?.summary?.additions || 0,
      deletions: data.info?.summary?.deletions || 0,
      createdAt: data.info?.time?.created,
      updatedAt: data.info?.time?.updated,
    }
  } catch (error) {
    console.error('Failed to get detailed session stats:', error)
    return null
  }
}
