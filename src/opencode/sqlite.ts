import { Database } from 'bun:sqlite'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { OPENCODE_DATA_DIR, OPENCODE_DATABASE_PATH } from './constants'

export interface OpencodeSessionRow {
  sessionID: string
  projectID: string
  directory: string
  title: string
  filesModified: number | null
  additions: number | null
  deletions: number | null
  createdAt: number
  updatedAt: number
}

export interface OpencodeDirectoryAggregateRow {
  sessionCount: number
  filesModified: number
  additions: number
  deletions: number
  createdAt: number
  updatedAt: number
}

export interface OpencodeAssistantMessageData {
  modelID?: string
  providerID?: string
  tokens: {
    input: number
    output: number
    reasoning: number
    cacheRead: number
    cacheWrite: number
  }
}

export interface OpencodeGlobalStatsRow {
  totalSessions: number
  totalMessages: number
  totalCost: number
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheWrite: number
  oldestCreatedAt: number | null
  newestUpdatedAt: number | null
}

interface DatabaseCandidate {
  path: string
  modifiedAt: number
}

interface SessionAggregateRow {
  messageCount: number
  totalCost: number
}

interface SessionTitleRow {
  title: string
}

interface AssistantMessageDataRow {
  data: string
}

interface GlobalSessionAggregateRow {
  totalSessions: number
  oldestCreatedAt: number | null
  newestUpdatedAt: number | null
}

interface GlobalMessageAggregateRow {
  totalMessages: number
  totalCost: number
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheWrite: number
}

let cachedDatabasePath: string | null = null
let cachedDatabase: Database | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseAssistantMessageData(raw: string, sessionID: string): OpencodeAssistantMessageData {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) {
    throw new Error(`Invalid OpenCode message payload for session '${sessionID}'`)
  }

  const tokensValue = isRecord(parsed.tokens) ? parsed.tokens : null
  const cacheValue = tokensValue && isRecord(tokensValue.cache) ? tokensValue.cache : null

  return {
    modelID: readString(parsed.modelID),
    providerID: readString(parsed.providerID),
    tokens: {
      input: readNumber(tokensValue?.input) ?? 0,
      output: readNumber(tokensValue?.output) ?? 0,
      reasoning: readNumber(tokensValue?.reasoning) ?? 0,
      cacheRead: readNumber(cacheValue?.read) ?? 0,
      cacheWrite: readNumber(cacheValue?.write) ?? 0,
    },
  }
}

function createDatabase(databasePath: string): Database {
  return new Database(databasePath, { readonly: true, strict: true })
}

async function getDatabaseCandidates(): Promise<DatabaseCandidate[]> {
  const entries = await readdir(OPENCODE_DATA_DIR).catch(() => [])
  const candidates = await Promise.all(
    entries
      .filter(entry => entry === 'opencode.db' || /^opencode-.+\.db$/.test(entry))
      .map(async entry => {
        const candidatePath = join(OPENCODE_DATA_DIR, entry)
        const details = await stat(candidatePath)
        return {
          path: candidatePath,
          modifiedAt: details.mtimeMs,
        }
      })
  )

  return candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)
}

export async function findOpencodeDatabasePath(): Promise<string | null> {
  if (await Bun.file(OPENCODE_DATABASE_PATH).exists()) {
    return OPENCODE_DATABASE_PATH
  }

  const [candidate] = await getDatabaseCandidates()
  return candidate?.path ?? null
}

export async function getOpencodeDatabasePath(): Promise<string> {
  const databasePath = await findOpencodeDatabasePath()
  if (!databasePath) {
    throw new Error(`OpenCode database not found in '${OPENCODE_DATA_DIR}'`)
  }

  return databasePath
}

async function withDatabase<T>(callback: (database: Database) => T): Promise<T> {
  const databasePath = await getOpencodeDatabasePath()

  if (!cachedDatabase || cachedDatabasePath !== databasePath) {
    cachedDatabase?.close()
    cachedDatabase = createDatabase(databasePath)
    cachedDatabasePath = databasePath
  }

  return callback(cachedDatabase)
}

function getSessionRow(
  database: Database,
  directory: string,
  activeSince?: number
): OpencodeSessionRow | null {
  if (activeSince !== undefined) {
    const statement = database.query<OpencodeSessionRow, [string, number]>(`
      SELECT
        id AS sessionID,
        project_id AS projectID,
        directory,
        title,
        summary_files AS filesModified,
        summary_additions AS additions,
        summary_deletions AS deletions,
        time_created AS createdAt,
        time_updated AS updatedAt
      FROM session
      WHERE directory = ?1
        AND COALESCE(time_updated, time_created) >= ?2
      ORDER BY COALESCE(time_updated, time_created) DESC, id DESC
      LIMIT 1
    `)

    return statement.get(directory, activeSince) ?? null
  }

  const statement = database.query<OpencodeSessionRow, [string]>(`
    SELECT
      id AS sessionID,
      project_id AS projectID,
      directory,
      title,
      summary_files AS filesModified,
      summary_additions AS additions,
      summary_deletions AS deletions,
      time_created AS createdAt,
      time_updated AS updatedAt
    FROM session
    WHERE directory = ?1
    ORDER BY COALESCE(time_updated, time_created) DESC, id DESC
    LIMIT 1
  `)

  return statement.get(directory) ?? null
}

function getMessageAggregate(database: Database, sessionID: string): SessionAggregateRow {
  const statement = database.query<SessionAggregateRow, [string]>(`
    SELECT
      COUNT(*) AS messageCount,
      COALESCE(
        SUM(
          CASE
            WHEN json_extract(data, '$.role') = 'assistant'
              THEN COALESCE(json_extract(data, '$.cost'), 0)
            ELSE 0
          END
        ),
        0
      ) AS totalCost
    FROM message
    WHERE session_id = ?1
  `)

  return statement.get(sessionID) ?? { messageCount: 0, totalCost: 0 }
}

export function getActiveSessionRowFromDatabase(
  database: Database,
  directory: string,
  activeSince: number
): OpencodeSessionRow | null {
  return getSessionRow(database, directory, activeSince)
}

export async function getActiveSessionRow(
  directory: string,
  activeSince: number
): Promise<OpencodeSessionRow | null> {
  return withDatabase(database => getActiveSessionRowFromDatabase(database, directory, activeSince))
}

export function getMostRecentSessionRowFromDatabase(
  database: Database,
  directory: string
): OpencodeSessionRow | null {
  return getSessionRow(database, directory)
}

export async function getMostRecentSessionRow(directory: string): Promise<OpencodeSessionRow | null> {
  return withDatabase(database => getMostRecentSessionRowFromDatabase(database, directory))
}

export function getDirectoryAggregateFromDatabase(
  database: Database,
  directory: string
): OpencodeDirectoryAggregateRow | null {
  const statement = database.query<OpencodeDirectoryAggregateRow, [string]>(`
    SELECT
      COUNT(*) AS sessionCount,
      COALESCE(SUM(summary_files), 0) AS filesModified,
      COALESCE(SUM(summary_additions), 0) AS additions,
      COALESCE(SUM(summary_deletions), 0) AS deletions,
      MIN(time_created) AS createdAt,
      MAX(COALESCE(time_updated, time_created)) AS updatedAt
    FROM session
    WHERE directory = ?1
  `)

  const row = statement.get(directory)
  if (!row || row.sessionCount === 0) {
    return null
  }

  return row
}

export async function getDirectoryAggregate(
  directory: string
): Promise<OpencodeDirectoryAggregateRow | null> {
  return withDatabase(database => getDirectoryAggregateFromDatabase(database, directory))
}

export function getMostRecentSessionTitleForDirectoryFromDatabase(
  database: Database,
  directory: string
): string | null {
  const statement = database.query<SessionTitleRow, [string]>(`
    SELECT title
    FROM session
    WHERE directory = ?1
    ORDER BY COALESCE(time_updated, time_created) DESC, id DESC
    LIMIT 1
  `)

  return statement.get(directory)?.title ?? null
}

export async function getMostRecentSessionTitleForDirectory(directory: string): Promise<string | null> {
  return withDatabase(database => getMostRecentSessionTitleForDirectoryFromDatabase(database, directory))
}

export function getMessageCountBySessionFromDatabase(database: Database, sessionID: string): number {
  return getMessageAggregate(database, sessionID).messageCount
}

export async function getMessageCountBySession(sessionID: string): Promise<number> {
  return withDatabase(database => getMessageCountBySessionFromDatabase(database, sessionID))
}

export function getMessageCountByDirectoryFromDatabase(database: Database, directory: string): number {
  const statement = database.query<{ messageCount: number }, [string]>(`
    SELECT COUNT(m.id) AS messageCount
    FROM message m
    INNER JOIN session s ON s.id = m.session_id
    WHERE s.directory = ?1
  `)

  return statement.get(directory)?.messageCount ?? 0
}

export async function getMessageCountByDirectory(directory: string): Promise<number> {
  return withDatabase(database => getMessageCountByDirectoryFromDatabase(database, directory))
}

export function getAssistantCostTotalBySessionFromDatabase(database: Database, sessionID: string): number {
  return getMessageAggregate(database, sessionID).totalCost
}

export async function getAssistantCostTotalBySession(sessionID: string): Promise<number> {
  return withDatabase(database => getAssistantCostTotalBySessionFromDatabase(database, sessionID))
}

export function getLastAssistantMessageDataFromDatabase(
  database: Database,
  sessionID: string
): OpencodeAssistantMessageData | null {
  const statement = database.query<AssistantMessageDataRow, [string]>(`
    SELECT data
    FROM message
    WHERE session_id = ?1
      AND json_extract(data, '$.role') = 'assistant'
      AND COALESCE(json_extract(data, '$.tokens.output'), 0) > 0
    ORDER BY time_created DESC, id DESC
    LIMIT 1
  `)

  const row = statement.get(sessionID)
  if (!row) {
    return null
  }

  return parseAssistantMessageData(row.data, sessionID)
}

export async function getLastAssistantMessageData(
  sessionID: string
): Promise<OpencodeAssistantMessageData | null> {
  return withDatabase(database => getLastAssistantMessageDataFromDatabase(database, sessionID))
}

export function getGlobalStatsFromDatabase(database: Database): OpencodeGlobalStatsRow {
  const sessionStatement = database.query<GlobalSessionAggregateRow, []>(`
    SELECT
      COUNT(*) AS totalSessions,
      MIN(time_created) AS oldestCreatedAt,
      MAX(COALESCE(time_updated, time_created)) AS newestUpdatedAt
    FROM session
  `)
  const messageStatement = database.query<GlobalMessageAggregateRow, []>(`
    SELECT
      COUNT(*) AS totalMessages,
      COALESCE(
        SUM(
          CASE
            WHEN json_extract(data, '$.role') = 'assistant'
              THEN COALESCE(json_extract(data, '$.cost'), 0)
            ELSE 0
          END
        ),
        0
      ) AS totalCost,
      COALESCE(SUM(COALESCE(json_extract(data, '$.tokens.input'), 0)), 0) AS inputTokens,
      COALESCE(SUM(COALESCE(json_extract(data, '$.tokens.output'), 0)), 0) AS outputTokens,
      COALESCE(SUM(COALESCE(json_extract(data, '$.tokens.cache.read'), 0)), 0) AS cacheRead,
      COALESCE(SUM(COALESCE(json_extract(data, '$.tokens.cache.write'), 0)), 0) AS cacheWrite
    FROM message
  `)

  const sessionRow = sessionStatement.get() ?? {
    totalSessions: 0,
    oldestCreatedAt: null,
    newestUpdatedAt: null,
  }
  const messageRow = messageStatement.get() ?? {
    totalMessages: 0,
    totalCost: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
  }

  return {
    totalSessions: sessionRow.totalSessions,
    totalMessages: messageRow.totalMessages,
    totalCost: messageRow.totalCost,
    inputTokens: messageRow.inputTokens,
    outputTokens: messageRow.outputTokens,
    cacheRead: messageRow.cacheRead,
    cacheWrite: messageRow.cacheWrite,
    oldestCreatedAt: sessionRow.oldestCreatedAt,
    newestUpdatedAt: sessionRow.newestUpdatedAt,
  }
}

export async function getGlobalStats(): Promise<OpencodeGlobalStatsRow> {
  return withDatabase(database => getGlobalStatsFromDatabase(database))
}
