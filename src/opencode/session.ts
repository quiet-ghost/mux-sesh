import { spawn } from 'bun'
import {
  getActiveSessionRow,
  getDirectoryAggregate,
  getMessageCountByDirectory,
  getMessageCountBySession,
  getMostRecentSessionRow,
  getMostRecentSessionTitleForDirectory,
  type OpencodeSessionRow,
} from './sqlite'
import { getLastMessageTokens } from './tokens'
import type { OpencodeStats } from './types'
import { getTmuxSessionDirectory } from '../tmux'

function toSummaryValue(value: number | null): number {
  return value ?? 0
}

async function buildSessionStats(row: OpencodeSessionRow): Promise<OpencodeStats> {
  const [messageCount, lastMessageData] = await Promise.all([
    getMessageCountBySession(row.sessionID),
    getLastMessageTokens(row.sessionID),
  ])

  return {
    sessionID: row.sessionID,
    title: row.title,
    projectID: row.projectID,
    directory: row.directory,
    messageCount,
    filesModified: toSummaryValue(row.filesModified),
    additions: toSummaryValue(row.additions),
    deletions: toSummaryValue(row.deletions),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastMessageTokens: lastMessageData?.lastMessageTokens,
    contextLimit: lastMessageData?.contextLimit,
    sessionTotalCost: lastMessageData?.totalCost,
  }
}

export async function getMessageCount(sessionID: string): Promise<number> {
  if (!sessionID) {
    return 0
  }

  return getMessageCountBySession(sessionID)
}

export async function getAggregatedMessageCount(directory: string): Promise<number> {
  return getMessageCountByDirectory(directory)
}

export async function getActiveOpencodeSession(directory: string): Promise<OpencodeStats | null> {
  const row = await getActiveSessionRow(directory, Date.now() - 5 * 60 * 1000)
  if (!row) {
    return null
  }

  return buildSessionStats(row)
}

export async function getAggregatedOpencodeStats(directory: string): Promise<OpencodeStats | null> {
  const aggregate = await getDirectoryAggregate(directory)
  if (!aggregate) {
    return null
  }

  const [messageCount, mostRecentTitle] = await Promise.all([
    getAggregatedMessageCount(directory),
    getMostRecentSessionTitleForDirectory(directory),
  ])

  return {
    title: `Global OpenCode Sessions (${aggregate.sessionCount} total)`,
    directory,
    messageCount,
    filesModified: aggregate.filesModified,
    additions: aggregate.additions,
    deletions: aggregate.deletions,
    createdAt: aggregate.createdAt,
    updatedAt: aggregate.updatedAt,
    sessionCount: aggregate.sessionCount,
    mostRecentTitle: mostRecentTitle ?? 'Unknown',
  }
}

export async function getMostRecentSessionForDirectory(
  directory: string
): Promise<OpencodeStats | null> {
  const row = await getMostRecentSessionRow(directory)
  if (!row) {
    return null
  }

  return buildSessionStats(row)
}

interface DetailedSessionExport {
  info?: {
    id?: string
    title?: string
    projectID?: string
    directory?: string
    summary?: {
      files?: number
      additions?: number
      deletions?: number
    }
    time?: {
      created?: number
      updated?: number
    }
  }
  messages?: unknown[]
}

export async function getDetailedSessionStats(sessionID: string): Promise<OpencodeStats | null> {
  const proc = spawn(['opencode', 'export', sessionID])
  const output = await new Response(proc.stdout).text()
  await proc.exited

  if (proc.exitCode !== 0) {
    throw new Error(`Failed to export OpenCode session '${sessionID}'`)
  }

  const jsonStart = output.indexOf('{')
  if (jsonStart === -1) {
    return null
  }

  const data = JSON.parse(output.slice(jsonStart)) as DetailedSessionExport

  return {
    sessionID: data.info?.id,
    title: data.info?.title,
    projectID: data.info?.projectID,
    directory: data.info?.directory,
    messageCount: data.messages?.length ?? 0,
    filesModified: data.info?.summary?.files ?? 0,
    additions: data.info?.summary?.additions ?? 0,
    deletions: data.info?.summary?.deletions ?? 0,
    createdAt: data.info?.time?.created,
    updatedAt: data.info?.time?.updated,
  }
}
