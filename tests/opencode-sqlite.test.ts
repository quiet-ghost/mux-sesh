import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  getActiveSessionRowFromDatabase,
  getDirectoryAggregateFromDatabase,
  getGlobalStatsFromDatabase,
  getLastAssistantMessageDataFromDatabase,
  getMessageCountByDirectoryFromDatabase,
  getMostRecentSessionRowFromDatabase,
} from '../src/opencode/sqlite'

describe('OpenCode SQLite helpers', () => {
  let database: Database

  beforeEach(() => {
    database = new Database(':memory:', { strict: true })
    database.run(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        directory TEXT NOT NULL,
        title TEXT NOT NULL,
        summary_files INTEGER,
        summary_additions INTEGER,
        summary_deletions INTEGER,
        time_created INTEGER NOT NULL,
        time_updated INTEGER NOT NULL
      )
    `)
    database.run(`
      CREATE TABLE message (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        time_updated INTEGER NOT NULL,
        data TEXT NOT NULL
      )
    `)
  })

  afterEach(() => {
    database.close()
  })

  test('returns the active or most recent session for a directory', () => {
    database.run(
      `
        INSERT INTO session (id, project_id, directory, title, summary_files, summary_additions, summary_deletions, time_created, time_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        'ses-old',
        'project-1',
        '/tmp/app',
        'Older session',
        1,
        2,
        3,
        100,
        200,
        'ses-new',
        'project-1',
        '/tmp/app',
        'Newest session',
        4,
        5,
        6,
        300,
        400,
      ]
    )

    const active = getActiveSessionRowFromDatabase(database, '/tmp/app', 350)
    const mostRecent = getMostRecentSessionRowFromDatabase(database, '/tmp/app')

    expect(active?.sessionID).toBe('ses-new')
    expect(mostRecent?.title).toBe('Newest session')
  })

  test('aggregates directory and global message stats from SQLite payloads', () => {
    database.run(
      `
        INSERT INTO session (id, project_id, directory, title, summary_files, summary_additions, summary_deletions, time_created, time_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        'ses-1',
        'project-1',
        '/tmp/app',
        'Alpha',
        2,
        10,
        3,
        100,
        200,
        'ses-2',
        'project-1',
        '/tmp/app',
        'Beta',
        3,
        4,
        1,
        300,
        500,
      ]
    )
    database.run(
      `
        INSERT INTO message (id, session_id, time_created, time_updated, data)
        VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)
      `,
      [
        'msg-1',
        'ses-1',
        150,
        150,
        JSON.stringify({
          role: 'assistant',
          cost: 1.25,
          tokens: { input: 100, output: 20, cache: { read: 5, write: 1 } },
        }),
        'msg-2',
        'ses-1',
        180,
        180,
        JSON.stringify({ role: 'user' }),
        'msg-3',
        'ses-2',
        450,
        450,
        JSON.stringify({
          role: 'assistant',
          cost: 2.5,
          tokens: { input: 40, output: 10, cache: { read: 2, write: 0 } },
        }),
      ]
    )

    const aggregate = getDirectoryAggregateFromDatabase(database, '/tmp/app')
    const messageCount = getMessageCountByDirectoryFromDatabase(database, '/tmp/app')
    const globalStats = getGlobalStatsFromDatabase(database)

    expect(aggregate).toEqual({
      sessionCount: 2,
      filesModified: 5,
      additions: 14,
      deletions: 4,
      createdAt: 100,
      updatedAt: 500,
    })
    expect(messageCount).toBe(3)
    expect(globalStats).toEqual({
      totalSessions: 2,
      totalMessages: 3,
      totalCost: 3.75,
      inputTokens: 140,
      outputTokens: 30,
      cacheRead: 7,
      cacheWrite: 1,
      oldestCreatedAt: 100,
      newestUpdatedAt: 500,
    })
  })

  test('extracts the latest assistant message token payload', () => {
    database.run(
      `
        INSERT INTO session (id, project_id, directory, title, summary_files, summary_additions, summary_deletions, time_created, time_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ['ses-1', 'project-1', '/tmp/app', 'Alpha', 0, 0, 0, 100, 200]
    )
    database.run(
      `
        INSERT INTO message (id, session_id, time_created, time_updated, data)
        VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)
      `,
      [
        'msg-1',
        'ses-1',
        150,
        150,
        JSON.stringify({
          role: 'assistant',
          modelID: 'gpt-5.4',
          providerID: 'openai',
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        }),
        'msg-2',
        'ses-1',
        220,
        220,
        JSON.stringify({
          role: 'assistant',
          modelID: 'gpt-5.4',
          providerID: 'openai',
          tokens: { input: 10, output: 20, reasoning: 30, cache: { read: 40, write: 50 } },
        }),
      ]
    )

    const payload = getLastAssistantMessageDataFromDatabase(database, 'ses-1')

    expect(payload).toEqual({
      modelID: 'gpt-5.4',
      providerID: 'openai',
      tokens: {
        input: 10,
        output: 20,
        reasoning: 30,
        cacheRead: 40,
        cacheWrite: 50,
      },
    })
  })
})
