import { describe, expect, test } from 'bun:test'
import {
  parseHerdrCreatedTab,
  parseHerdrCreatedWorkspace,
  parseHerdrResult,
  parseHerdrSnapshot,
  parseHerdrStatus,
} from '../src/herdr/protocol'
import { MultiplexerError } from '../src/multiplexer'

const GUIDANCE = "Run 'herdr status --json' to verify the server and protocol."

interface RawWorkspace {
  workspace_id: string
  label?: string
  focused: boolean
  tab_count: number
  active_tab_id: string
  agent_status?: string
  worktree?: { checkout_path: string }
  pane_count?: number
}

interface RawPane {
  pane_id: string
  workspace_id: string
  tab_id: string
  focused: boolean
  agent_status: string
  cwd?: string | null
  foreground_cwd?: string
  display_agent?: string
  label?: string
  title?: string
  terminal_id?: string
}

interface RawAgent {
  pane_id: string
  workspace_id: string
  tab_id: string
  agent_status: string
  name?: string
  agent?: string
  cwd?: string
}

interface RawSnapshot {
  version: string
  protocol: number
  focused_workspace_id: string
  focused_tab_id: string
  focused_pane_id: string
  workspaces: RawWorkspace[]
  tabs: {
    tab_id: string
    workspace_id: string
    number: number
    label: string
    pane_count?: number
  }[]
  panes: RawPane[]
  layouts: { workspace_id: string; tab_id: string; focused_pane_id: string; zoomed?: boolean }[]
  agents: RawAgent[]
}

function rawSnapshot(): RawSnapshot {
  return {
    version: '0.7.5',
    protocol: 17,
    focused_workspace_id: 'w1',
    focused_tab_id: 'w1:t1',
    focused_pane_id: '',
    workspaces: [
      {
        workspace_id: 'w1',
        label: 'api',
        focused: true,
        tab_count: 1,
        active_tab_id: 'w1:t1',
        agent_status: 'working',
        worktree: { checkout_path: '/repo' },
        pane_count: 1,
      },
      {
        workspace_id: 'w2',
        label: 'web',
        focused: false,
        tab_count: 1,
        active_tab_id: 'w2:t1',
        agent_status: 'idle',
      },
    ],
    tabs: [
      { tab_id: 'w1:t1', workspace_id: 'w1', number: 1, label: 'main', pane_count: 1 },
      { tab_id: 'w2:t1', workspace_id: 'w2', number: 1, label: 'main' },
    ],
    panes: [
      {
        pane_id: 'w1:p1',
        workspace_id: 'w1',
        tab_id: 'w1:t1',
        focused: true,
        agent_status: 'working',
        cwd: '/repo/api',
        foreground_cwd: '/repo/api/src',
        display_agent: 'opencode',
        label: 'agent',
        title: 'opencode',
        terminal_id: 'term-1',
      },
      {
        pane_id: 'w2:p1',
        workspace_id: 'w2',
        tab_id: 'w2:t1',
        focused: false,
        agent_status: 'idle',
        cwd: '/repo/web',
      },
    ],
    layouts: [
      { workspace_id: 'w1', tab_id: 'w1:t1', focused_pane_id: 'w1:p1', zoomed: false },
      { workspace_id: 'w2', tab_id: 'w2:t1', focused_pane_id: 'w2:p1' },
    ],
    agents: [
      {
        pane_id: 'w1:p1',
        workspace_id: 'w1',
        tab_id: 'w1:t1',
        agent_status: 'working',
        name: 'opencode-api',
        agent: 'opencode',
        cwd: '/repo/api/src',
      },
    ],
  }
}

function snapshotOutput(snapshot: RawSnapshot): string {
  return JSON.stringify({ id: 'cli:snapshot', result: { type: 'session_snapshot', snapshot } })
}

function failure(parse: () => void): MultiplexerError {
  try {
    parse()
  } catch (error) {
    if (error instanceof MultiplexerError) return error
    throw error
  }

  throw new Error('expected the parser to throw a MultiplexerError')
}

function expectInvalid(parse: () => void, detail: string): void {
  const error = failure(parse)

  expect(error.code).toBe('invalid-response')
  expect(error.message.startsWith('Herdr returned an invalid response: ')).toBe(true)
  expect(error.message).toContain(detail)
  expect(error.message.endsWith(GUIDANCE)).toBe(true)
}

describe('parseHerdrSnapshot', () => {
  test('decodes a snapshot into camelCase records and ignores unknown fields', () => {
    expect(parseHerdrSnapshot(snapshotOutput(rawSnapshot()))).toEqual({
      focusedWorkspaceId: 'w1',
      focusedTabId: 'w1:t1',
      focusedPaneId: undefined,
      workspaces: [
        {
          id: 'w1',
          label: 'api',
          focused: true,
          tabCount: 1,
          activeTabId: 'w1:t1',
          agentStatus: 'working',
          worktreePath: '/repo',
        },
        {
          id: 'w2',
          label: 'web',
          focused: false,
          tabCount: 1,
          activeTabId: 'w2:t1',
          agentStatus: 'idle',
          worktreePath: undefined,
        },
      ],
      tabs: [
        { id: 'w1:t1', workspaceId: 'w1', number: 1, label: 'main' },
        { id: 'w2:t1', workspaceId: 'w2', number: 1, label: 'main' },
      ],
      panes: [
        {
          id: 'w1:p1',
          workspaceId: 'w1',
          tabId: 'w1:t1',
          focused: true,
          agentStatus: 'working',
          cwd: '/repo/api',
          foregroundCwd: '/repo/api/src',
          displayAgent: 'opencode',
          label: 'agent',
          title: 'opencode',
        },
        {
          id: 'w2:p1',
          workspaceId: 'w2',
          tabId: 'w2:t1',
          focused: false,
          agentStatus: 'idle',
          cwd: '/repo/web',
        },
      ],
      layouts: [
        { workspaceId: 'w1', tabId: 'w1:t1', focusedPaneId: 'w1:p1' },
        { workspaceId: 'w2', tabId: 'w2:t1', focusedPaneId: 'w2:p1' },
      ],
      agents: [
        {
          paneId: 'w1:p1',
          workspaceId: 'w1',
          tabId: 'w1:t1',
          status: 'working',
          name: 'opencode-api',
          agent: 'opencode',
          cwd: '/repo/api/src',
        },
      ],
    })
  })

  test('decodes unrecognised or missing agent statuses as unknown', () => {
    const snapshot = rawSnapshot()
    snapshot.workspaces[0].agent_status = 'thinking'
    delete snapshot.workspaces[1].agent_status
    snapshot.panes[0].agent_status = 'paused'
    snapshot.agents[0].agent_status = ''

    const parsed = parseHerdrSnapshot(snapshotOutput(snapshot))

    expect(parsed.workspaces.map(workspace => workspace.agentStatus)).toEqual([
      'unknown',
      'unknown',
    ])
    expect(parsed.panes.map(pane => pane.agentStatus)).toEqual(['unknown', 'idle'])
    expect(parsed.agents.map(agent => agent.status)).toEqual(['unknown'])
  })

  test('treats empty or null optional strings as absent', () => {
    const snapshot = rawSnapshot()
    snapshot.workspaces[0].worktree = { checkout_path: '' }
    snapshot.panes[0].cwd = ''
    snapshot.panes[0].title = ''
    snapshot.panes[1].cwd = null
    snapshot.agents[0].name = ''

    const parsed = parseHerdrSnapshot(snapshotOutput(snapshot))

    expect(parsed.focusedPaneId).toBeUndefined()
    expect(parsed.workspaces[0]?.worktreePath).toBeUndefined()
    expect(parsed.panes[0]?.cwd).toBeUndefined()
    expect(parsed.panes[0]?.title).toBeUndefined()
    expect(parsed.panes[1]?.cwd).toBeUndefined()
    expect(parsed.agents[0]?.name).toBeUndefined()
  })

  test('names the full path of a missing required field', () => {
    const snapshot = rawSnapshot()
    delete snapshot.workspaces[1].label

    expectInvalid(
      () => parseHerdrSnapshot(snapshotOutput(snapshot)),
      'result.snapshot.workspaces[1].label'
    )
  })

  test('names the full path of an empty required string', () => {
    const snapshot = rawSnapshot()
    snapshot.panes[1].tab_id = ''

    expectInvalid(
      () => parseHerdrSnapshot(snapshotOutput(snapshot)),
      'result.snapshot.panes[1].tab_id'
    )
  })

  test('rejects an agent whose pane belongs to another tab', () => {
    const snapshot = rawSnapshot()
    snapshot.agents[0].tab_id = 'w2:t1'

    expectInvalid(
      () => parseHerdrSnapshot(snapshotOutput(snapshot)),
      "agent pane 'w1:p1' is not a pane of tab 'w2:t1' in workspace 'w1'"
    )
  })

  test('rejects an agent that names a missing workspace', () => {
    const snapshot = rawSnapshot()
    snapshot.agents[0].workspace_id = 'w9'

    expectInvalid(
      () => parseHerdrSnapshot(snapshotOutput(snapshot)),
      "agent pane 'w1:p1' names missing workspace 'w9'"
    )
  })
})

describe('parseHerdrResult', () => {
  test('rejects output that is not JSON', () => {
    expectInvalid(() => parseHerdrResult('{not json', 'session_snapshot'), 'not valid JSON')
  })

  test('rejects a response without a result object', () => {
    expectInvalid(() => parseHerdrResult('{"id":"cli"}', 'session_snapshot'), 'result')
  })

  test('surfaces an error envelope as a rejected request', () => {
    const error = failure(() =>
      parseHerdrResult('{"error":{"code":"not_found","message":"no such pane"}}', 'pane_focused')
    )

    expect(error.code).toBe('command-failed')
    expect(error.message).toBe('Herdr rejected the request: no such pane')
  })

  test('falls back to a generic message when the error envelope has none', () => {
    const error = failure(() => parseHerdrResult('{"error":{"code":"boom"}}', 'pane_focused'))

    expect(error.code).toBe('command-failed')
    expect(error.message).toBe('Herdr rejected the request: unknown Herdr API error')
  })

  test('surfaces an error envelope even when result is null', () => {
    const error = failure(() =>
      parseHerdrSnapshot('{"error":{"message":"server busy"},"result":null}')
    )

    expect(error.code).toBe('command-failed')
    expect(error.message).toBe('Herdr rejected the request: server busy')
  })

  test('surfaces an error envelope even when result is invalid', () => {
    const error = failure(() =>
      parseHerdrSnapshot(
        '{"error":{"message":"server busy"},"result":{"type":"session_snapshot","snapshot":{}}}'
      )
    )

    expect(error.code).toBe('command-failed')
    expect(error.message).toBe('Herdr rejected the request: server busy')
  })

  test('surfaces an error envelope even when result is valid', () => {
    const error = failure(() =>
      parseHerdrResult('{"error":{},"result":{"type":"pane_focused"}}', 'pane_focused')
    )

    expect(error.code).toBe('command-failed')
    expect(error.message).toBe('Herdr rejected the request: unknown Herdr API error')
  })

  test('rejects a malformed error envelope', () => {
    expectInvalid(() => parseHerdrResult('{"error":"boom"}', 'pane_focused'), 'error')
  })

  test('rejects a result of the wrong type', () => {
    expectInvalid(
      () => parseHerdrResult('{"result":{"type":"tab_created"}}', 'session_snapshot'),
      'result.type'
    )
  })

  test('returns the result record for the expected type', () => {
    expect(parseHerdrResult('{"result":{"type":"ok","extra":1}}', 'ok')).toMatchObject({
      type: 'ok',
    })
  })
})

describe('created records', () => {
  test('decodes a created workspace', () => {
    const output = JSON.stringify({
      result: {
        type: 'workspace_created',
        workspace: { workspace_id: 'w3', label: 'docs', focused: true },
        tab: { tab_id: 'w3:t1' },
        root_pane: { pane_id: 'w3:p1', cwd: '/repo/docs' },
      },
    })

    expect(parseHerdrCreatedWorkspace(output)).toEqual({
      workspaceId: 'w3',
      workspaceTitle: 'docs',
      rootPaneId: 'w3:p1',
    })
  })

  test('names the path of a missing created workspace field', () => {
    const output = JSON.stringify({
      result: { type: 'workspace_created', workspace: { workspace_id: 'w3' }, root_pane: {} },
    })

    expectInvalid(() => parseHerdrCreatedWorkspace(output), 'result.workspace.label')
  })

  test('decodes a created tab', () => {
    const output = JSON.stringify({
      result: { type: 'tab_created', tab: { tab_id: 'w1:t2' }, root_pane: { pane_id: 'w1:p2' } },
    })

    expect(parseHerdrCreatedTab(output)).toEqual({ tabId: 'w1:t2', rootPaneId: 'w1:p2' })
  })

  test('names the path of a missing created tab root pane', () => {
    const output = JSON.stringify({ result: { type: 'tab_created', tab: { tab_id: 'w1:t2' } } })

    expectInvalid(() => parseHerdrCreatedTab(output), 'result.root_pane')
  })
})

describe('parseHerdrStatus', () => {
  test('decodes running, compatible, and protocol', () => {
    const output = JSON.stringify({
      client: { version: '0.7.5' },
      server: { running: true, compatible: true, protocol: 17, version: '0.7.5' },
    })

    expect(parseHerdrStatus(output)).toEqual({ running: true, compatible: true, protocol: 17 })
  })

  test('leaves missing compatibility and protocol undefined', () => {
    expect(parseHerdrStatus('{"server":{"running":false}}')).toEqual({
      running: false,
      compatible: undefined,
      protocol: undefined,
    })
  })

  test('names the path of a malformed running flag', () => {
    expectInvalid(() => parseHerdrStatus('{"server":{"running":"yes"}}'), 'server.running')
  })

  test('rejects status output that is not JSON', () => {
    expectInvalid(() => parseHerdrStatus('herdr: not running'), 'not valid JSON')
  })
})
