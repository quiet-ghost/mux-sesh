import { describe, expect, test } from 'bun:test'
import { createHerdrBackend, type CommandOptions, type CommandRunner } from '../src/herdr/backend'
import { MultiplexerError } from '../src/multiplexer'

const snapshot = JSON.stringify({
  id: 'cli:api:snapshot',
  result: {
    type: 'session_snapshot',
    snapshot: {
      version: '0.7.5',
      protocol: 17,
      focused_workspace_id: 'w1',
      focused_tab_id: 'w1:t1',
      focused_pane_id: 'w1:p1',
      workspaces: [
        {
          workspace_id: 'w1',
          number: 1,
          label: 'api',
          focused: true,
          pane_count: 1,
          tab_count: 1,
          active_tab_id: 'w1:t1',
          agent_status: 'working',
          worktree: {
            repo_key: 'repo',
            repo_name: 'repo',
            repo_root: '/repo',
            checkout_path: '/repo',
            is_linked_worktree: false,
          },
        },
        {
          workspace_id: 'w2',
          number: 2,
          label: 'api',
          focused: false,
          pane_count: 1,
          tab_count: 1,
          active_tab_id: 'w2:t1',
          agent_status: 'idle',
        },
      ],
      tabs: [
        {
          tab_id: 'w1:t1',
          workspace_id: 'w1',
          number: 1,
          label: 'main',
          focused: true,
          pane_count: 1,
          agent_status: 'working',
        },
        {
          tab_id: 'w2:t1',
          workspace_id: 'w2',
          number: 1,
          label: 'main',
          focused: false,
          pane_count: 1,
          agent_status: 'idle',
        },
      ],
      panes: [
        {
          pane_id: 'w1:p1',
          terminal_id: 'term-1',
          workspace_id: 'w1',
          tab_id: 'w1:t1',
          focused: true,
          agent_status: 'working',
          revision: 2,
          cwd: '/repo/api',
          foreground_cwd: '/repo/api/src',
          display_agent: 'opencode',
        },
        {
          pane_id: 'w2:p1',
          terminal_id: 'term-2',
          workspace_id: 'w2',
          tab_id: 'w2:t1',
          focused: false,
          agent_status: 'idle',
          revision: 1,
          cwd: '/repo/api-copy',
        },
      ],
      layouts: [
        {
          workspace_id: 'w1',
          tab_id: 'w1:t1',
          zoomed: false,
          area: { x: 0, y: 0, width: 120, height: 40 },
          focused_pane_id: 'w1:p1',
          panes: [],
          splits: [],
        },
        {
          workspace_id: 'w2',
          tab_id: 'w2:t1',
          zoomed: false,
          area: { x: 0, y: 0, width: 120, height: 40 },
          focused_pane_id: 'w2:p1',
          panes: [],
          splits: [],
        },
      ],
      agents: [
        {
          terminal_id: 'term-1',
          agent_status: 'working',
          workspace_id: 'w1',
          tab_id: 'w1:t1',
          pane_id: 'w1:p1',
          focused: true,
          revision: 2,
          name: 'opencode-api',
          cwd: '/repo/api/src',
        },
      ],
    },
  },
})

const agentsWorkspaceSnapshot = JSON.stringify({
  id: 'cli:api:snapshot',
  result: {
    type: 'session_snapshot',
    snapshot: {
      focused_workspace_id: 'agents',
      focused_tab_id: 'agents:t1',
      focused_pane_id: 'agents:p1',
      workspaces: [
        {
          workspace_id: 'agents',
          label: 'Agents',
          focused: true,
          tab_count: 2,
          active_tab_id: 'agents:t1',
          agent_status: 'done',
        },
      ],
      tabs: [
        { tab_id: 'agents:t1', workspace_id: 'agents', number: 1, label: 'api-agent' },
        { tab_id: 'agents:t2', workspace_id: 'agents', number: 2, label: 'web-agent' },
      ],
      panes: [
        {
          pane_id: 'agents:p1',
          workspace_id: 'agents',
          tab_id: 'agents:t1',
          focused: true,
          agent_status: 'working',
          cwd: '/repo/api',
          foreground_cwd: '/repo/api/src',
          display_agent: 'opencode',
        },
        {
          pane_id: 'agents:p2',
          workspace_id: 'agents',
          tab_id: 'agents:t2',
          focused: false,
          agent_status: 'idle',
          cwd: '/repo/web',
          display_agent: 'pi',
        },
      ],
      layouts: [
        {
          workspace_id: 'agents',
          tab_id: 'agents:t1',
          focused_pane_id: 'agents:p1',
        },
        {
          workspace_id: 'agents',
          tab_id: 'agents:t2',
          focused_pane_id: 'agents:p2',
        },
      ],
      agents: [
        {
          agent_status: 'working',
          workspace_id: 'agents',
          tab_id: 'agents:t1',
          pane_id: 'agents:p1',
          name: 'opencode-api',
          foreground_cwd: '/repo/api/src',
        },
        {
          agent_status: 'idle',
          workspace_id: 'agents',
          tab_id: 'agents:t2',
          pane_id: 'agents:p2',
          name: 'pi-web',
          cwd: '/repo/web',
        },
      ],
    },
  },
})

function recordingRunner(responses: Array<{ exitCode: number; stdout: string; stderr: string }>) {
  const commands: string[][] = []
  const options: Array<CommandOptions | undefined> = []

  return {
    commands,
    options,
    runner: {
      async run(command, commandOptions) {
        commands.push([...command])
        options.push(commandOptions)

        return responses.shift() ?? { exitCode: 0, stdout: '', stderr: '' }
      },
    } satisfies CommandRunner,
  }
}

describe('Herdr backend', () => {
  test('lists the Agents workspace and each detected agent as an individual target', async () => {
    const { runner } = recordingRunner([
      { exitCode: 0, stdout: agentsWorkspaceSnapshot, stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: true })

    expect(await backend.list()).toEqual([
      {
        backend: 'herdr',
        id: 'agents',
        title: 'Agents',
        path: '/repo/api',
        isActive: true,
        unitCount: 2,
        agentStatus: 'done',
      },
      {
        backend: 'herdr',
        id: 'agents',
        title: 'opencode-api',
        workspaceTitle: 'Agents',
        path: '/repo/api/src',
        isActive: true,
        unitCount: 1,
        agentStatus: 'working',
        target: { kind: 'agent', tabId: 'agents:t1', paneId: 'agents:p1' },
      },
      {
        backend: 'herdr',
        id: 'agents',
        title: 'pi-web',
        workspaceTitle: 'Agents',
        path: '/repo/web',
        isActive: false,
        unitCount: 1,
        agentStatus: 'idle',
        target: { kind: 'agent', tabId: 'agents:t2', paneId: 'agents:p2' },
      },
    ])
  })

  test('lists workspaces from a validated snapshot without collapsing duplicate labels', async () => {
    const { runner, commands } = recordingRunner([{ exitCode: 0, stdout: snapshot, stderr: '' }])
    const backend = createHerdrBackend({ runner, insideHerdr: true })

    expect(await backend.list()).toEqual([
      {
        backend: 'herdr',
        id: 'w1',
        title: 'api',
        path: '/repo/api',
        isActive: true,
        unitCount: 1,
        agentStatus: 'working',
      },
      {
        backend: 'herdr',
        id: 'w1',
        title: 'opencode-api',
        workspaceTitle: 'api',
        path: '/repo/api/src',
        isActive: true,
        unitCount: 1,
        agentStatus: 'working',
        target: { kind: 'agent', tabId: 'w1:t1', paneId: 'w1:p1' },
      },
      {
        backend: 'herdr',
        id: 'w2',
        title: 'api',
        path: '/repo/api-copy',
        isActive: false,
        unitCount: 1,
        agentStatus: 'idle',
      },
    ])
    expect(commands).toEqual([['herdr', 'api', 'snapshot']])
  })

  test('keeps an empty Agents workspace and distinct agents that share one tab', async () => {
    const shared = JSON.stringify({
      result: {
        type: 'session_snapshot',
        snapshot: {
          workspaces: [
            {
              workspace_id: 'empty',
              label: 'Agents',
              focused: false,
              tab_count: 1,
              active_tab_id: 'empty:t1',
            },
            {
              workspace_id: 'w3',
              label: 'pair',
              focused: false,
              tab_count: 1,
              active_tab_id: 'w3:t1',
            },
          ],
          tabs: [{ tab_id: 'w3:t1', workspace_id: 'w3', number: 1, label: 'main' }],
          panes: [
            {
              pane_id: 'w3:p1',
              workspace_id: 'w3',
              tab_id: 'w3:t1',
              focused: false,
              cwd: '/repo/a',
            },
            {
              pane_id: 'w3:p2',
              workspace_id: 'w3',
              tab_id: 'w3:t1',
              focused: false,
              cwd: '/repo/b',
            },
          ],
          layouts: [],
          agents: [
            { workspace_id: 'w3', tab_id: 'w3:t1', pane_id: 'w3:p1', name: 'twin' },
            {
              workspace_id: 'w3',
              tab_id: 'w3:t1',
              pane_id: 'w3:p2',
              name: 'twin',
              agent_status: 'surprise',
            },
          ],
        },
      },
    })

    const { runner } = recordingRunner([{ exitCode: 0, stdout: shared, stderr: '' }])
    const listed = await createHerdrBackend({ runner, insideHerdr: true }).list()

    expect(
      listed.map(row => [
        row.id,
        row.title,
        row.backend === 'herdr' ? row.target?.paneId : undefined,
      ])
    ).toEqual([
      ['empty', 'Agents', undefined],
      ['w3', 'pair', undefined],
      ['w3', 'twin', 'w3:p1'],
      ['w3', 'twin', 'w3:p2'],
    ])
    expect(listed[3]?.agentStatus).toBe('unknown')
  })

  test('rejects an agent whose pane is not in the same snapshot', async () => {
    const dangling = JSON.stringify({
      result: {
        type: 'session_snapshot',
        snapshot: {
          workspaces: [
            {
              workspace_id: 'w1',
              label: 'api',
              focused: false,
              tab_count: 1,
              active_tab_id: 'w1:t1',
            },
          ],
          tabs: [],
          panes: [],
          layouts: [],
          agents: [{ workspace_id: 'w1', tab_id: 'w1:t1', pane_id: 'w1:gone', name: 'ghost' }],
        },
      },
    })

    const { runner } = recordingRunner([{ exitCode: 0, stdout: dangling, stderr: '' }])
    const backend = createHerdrBackend({ runner, insideHerdr: true })

    expect.assertions(2)

    try {
      await backend.list()
    } catch (cause) {
      expect(cause).toBeInstanceOf(MultiplexerError)
      expect(cause instanceof Error ? cause.message : '').toContain(
        "agent pane 'w1:gone' is not a pane of tab 'w1:t1' in workspace 'w1'"
      )
    }
  })

  test('focuses by workspace id and attaches when launched outside Herdr', async () => {
    const response = JSON.stringify({
      id: 'cli:workspace:focus',
      result: { type: 'workspace_info', workspace: {} },
    })

    const { runner, commands, options } = recordingRunner([
      { exitCode: 0, stdout: response, stderr: '' },
      { exitCode: 0, stdout: '', stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: false })

    const outcome = await backend.open({ backend: 'herdr', id: 'w7', title: 'duplicate label' })

    expect(commands).toEqual([['herdr', 'workspace', 'focus', 'w7']])
    expect(options).toEqual([undefined])
    expect(outcome).toEqual({
      kind: 'handoff',
      handoff: { command: ['herdr'], description: 'attach the Herdr client' },
    })
  })

  test('focuses the exact agent pane, not its tab, for agents sharing one tab', async () => {
    const focused = JSON.stringify({ result: { type: 'agent_info', agent: {} } })

    const { runner, commands, options } = recordingRunner([
      { exitCode: 0, stdout: focused, stderr: '' },
      { exitCode: 0, stdout: focused, stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: true })

    for (const paneId of ['w3:p1', 'w3:p2']) {
      await backend.open({
        backend: 'herdr',
        id: 'w3',
        title: 'twin',
        target: { kind: 'agent', tabId: 'w3:t1', paneId },
      })
    }

    expect(commands).toEqual([
      ['herdr', 'agent', 'focus', 'w3:p1'],
      ['herdr', 'agent', 'focus', 'w3:p2'],
    ])
    expect(options.every(option => option === undefined)).toBe(true)
  })

  test('a failed agent focus explains recovery without focusing another pane or attaching', async () => {
    const { runner, commands } = recordingRunner([
      { exitCode: 1, stdout: '', stderr: '{"error":{"message":"agent not found"}}' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: false })

    expect.assertions(3)

    try {
      await backend.open({
        backend: 'herdr',
        id: 'w3',
        title: 'twin',
        target: { kind: 'agent', tabId: 'w3:t1', paneId: 'w3:p2' },
      })
    } catch (cause) {
      expect(cause instanceof Error ? cause.message : '').toContain(
        "Herdr could not focus agent pane 'w3:p2'"
      )
      expect(cause instanceof Error ? cause.message : '').toContain('Refresh the list')
    }

    expect(commands).toEqual([['herdr', 'agent', 'focus', 'w3:p2']])
  })

  test('creates without focusing and returns the native workspace and root pane', async () => {
    const created = JSON.stringify({
      result: {
        type: 'workspace_created',
        workspace: { workspace_id: 'w3', label: 'web' },
        tab: { tab_id: 'w3:t1' },
        root_pane: { pane_id: 'w3:p1' },
      },
    })

    const { runner, commands, options } = recordingRunner([
      { exitCode: 0, stdout: created, stderr: '' },
      { exitCode: 0, stdout: '', stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: false })

    const receipt = await backend.create({ title: 'web', path: '/repo/web' })
    await backend.start(receipt, 'bun dev')

    expect(receipt).toEqual({
      workspace: { backend: 'herdr', id: 'w3', title: 'web' },
      rootPaneId: 'w3:p1',
    })
    expect(commands).toEqual([
      ['herdr', 'workspace', 'create', '--cwd', '/repo/web', '--label', 'web'],
      ['herdr', 'pane', 'run', 'w3:p1', 'bun dev'],
    ])
    expect(options.every(option => option === undefined)).toBe(true)
  })

  test('creates a workspace, runs startup command in its root pane, then focuses it', async () => {
    const created = JSON.stringify({
      id: 'cli:workspace:create',
      result: {
        type: 'workspace_created',
        workspace: { workspace_id: 'w3', label: 'web' },
        tab: { tab_id: 'w3:t1' },
        root_pane: { pane_id: 'w3:p1' },
      },
    })

    const { runner, commands } = recordingRunner([
      { exitCode: 0, stdout: snapshot, stderr: '' },
      { exitCode: 0, stdout: created, stderr: '' },
      { exitCode: 0, stdout: '', stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: true })

    await backend.openOrCreate({ title: 'web', path: '/repo/web', startupCommand: 'bun dev' })

    expect(commands).toEqual([
      ['herdr', 'api', 'snapshot'],
      ['herdr', 'workspace', 'create', '--cwd', '/repo/web', '--label', 'web', '--focus'],
      ['herdr', 'pane', 'run', 'w3:p1', 'bun dev'],
    ])
  })

  test('reuses a workspace by stable cwd when its foreground process changed directory', async () => {
    const focused = JSON.stringify({
      id: 'cli:workspace:focus',
      result: { type: 'workspace_info', workspace: {} },
    })

    const { runner, commands } = recordingRunner([
      { exitCode: 0, stdout: snapshot, stderr: '' },
      { exitCode: 0, stdout: focused, stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: true })

    await backend.openOrCreate({ title: 'api', path: '/repo/api' })

    expect(commands).toEqual([
      ['herdr', 'api', 'snapshot'],
      ['herdr', 'workspace', 'focus', 'w1'],
    ])
  })

  test('reuses a repository-root workspace after its shell changes directory', async () => {
    const changedCwdSnapshot = snapshot.replace('"cwd":"/repo/api"', '"cwd":"/repo/src"')

    const focused = JSON.stringify({
      id: 'cli:workspace:focus',
      result: { type: 'workspace_info', workspace: {} },
    })

    const { runner, commands } = recordingRunner([
      { exitCode: 0, stdout: changedCwdSnapshot, stderr: '' },
      { exitCode: 0, stdout: focused, stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: true })

    await backend.openOrCreate({ title: 'api', path: '/repo' })

    expect(commands).toEqual([
      ['herdr', 'api', 'snapshot'],
      ['herdr', 'workspace', 'focus', 'w1'],
    ])
  })

  test('renames and closes duplicate labels by workspace id', async () => {
    const renamed = JSON.stringify({
      id: 'cli:workspace:rename',
      result: { type: 'workspace_info', workspace: {} },
    })

    const closed = JSON.stringify({ id: 'cli:workspace:close', result: { type: 'ok' } })

    const { runner, commands } = recordingRunner([
      { exitCode: 0, stdout: renamed, stderr: '' },
      { exitCode: 0, stdout: closed, stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: true })
    const workspace = { backend: 'herdr' as const, id: 'w9', title: 'api' }

    await backend.rename(workspace, 'renamed')
    await backend.close(workspace)

    expect(commands).toEqual([
      ['herdr', 'workspace', 'rename', 'w9', 'renamed'],
      ['herdr', 'workspace', 'close', 'w9'],
    ])
  })

  test('does not rename or close a targeted agent through its shared workspace', async () => {
    const { runner, commands } = recordingRunner([])
    const backend = createHerdrBackend({ runner, insideHerdr: true })

    const agent = {
      backend: 'herdr' as const,
      id: 'agents',
      title: 'opencode-api',
      target: { kind: 'agent' as const, tabId: 'agents:t1', paneId: 'agents:p1' },
    }

    expect((await rejectionOf(backend.rename(agent, 'renamed'))).message).toContain(
      'Cannot rename an agent tab'
    )
    expect((await rejectionOf(backend.close(agent))).message).toContain('Cannot close an agent tab')
    expect(commands).toEqual([])
  })

  test('returns tab, pane preview, and native agent details', async () => {
    const { runner, commands } = recordingRunner([
      { exitCode: 0, stdout: snapshot, stderr: '' },
      { exitCode: 0, stdout: 'working\nready\n', stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: true })

    expect(await backend.details({ backend: 'herdr', id: 'w1', title: 'api' })).toEqual({
      workspace: { backend: 'herdr', id: 'w1', title: 'api' },
      isActive: true,
      unitLabel: 'Tabs',
      units: [
        {
          id: 'w1:t1',
          name: 'main',
          currentPath: '/repo/api/src',
          currentCommand: 'opencode',
        },
      ],
      previewLines: ['working', 'ready'],
      agents: [{ paneId: 'w1:p1', name: 'opencode-api', status: 'working', cwd: '/repo/api/src' }],
    })
    expect(commands).toEqual([
      ['herdr', 'api', 'snapshot'],
      ['herdr', 'pane', 'read', 'w1:p1', '--source', 'recent-unwrapped', '--lines', '16'],
    ])
  })

  test('passes the caller signal to the snapshot and pane reads behind details', async () => {
    const { runner, options } = recordingRunner([
      { exitCode: 0, stdout: snapshot, stderr: '' },
      { exitCode: 0, stdout: 'ready\n', stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: true })
    const controller = new AbortController()

    await backend.details(
      { backend: 'herdr', id: 'w1', title: 'api' },
      { signal: controller.signal }
    )

    expect(options).toHaveLength(2)
    expect(options.every(option => option?.signal === controller.signal)).toBe(true)
  })

  test('returns details and preview for the targeted agent tab', async () => {
    const { runner, commands } = recordingRunner([
      { exitCode: 0, stdout: agentsWorkspaceSnapshot, stderr: '' },
      { exitCode: 0, stdout: 'web agent output\n', stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: true })

    expect(
      await backend.details({
        backend: 'herdr',
        id: 'agents',
        title: 'pi-web',
        target: { kind: 'agent', tabId: 'agents:t2', paneId: 'agents:p2' },
      })
    ).toEqual({
      workspace: {
        backend: 'herdr',
        id: 'agents',
        title: 'pi-web',
        target: { kind: 'agent', tabId: 'agents:t2', paneId: 'agents:p2' },
      },
      isActive: false,
      unitLabel: 'Tabs',
      units: [
        {
          id: 'agents:t2',
          name: 'web-agent',
          currentPath: '/repo/web',
          currentCommand: 'pi',
        },
      ],
      previewLines: ['web agent output'],
      agents: [{ paneId: 'agents:p2', name: 'pi-web', status: 'idle', cwd: '/repo/web' }],
    })
    expect(commands).toEqual([
      ['herdr', 'api', 'snapshot'],
      ['herdr', 'pane', 'read', 'agents:p2', '--source', 'recent-unwrapped', '--lines', '16'],
    ])
  })

  test('opens an editor in a new tab inside Herdr', async () => {
    const tabCreated = JSON.stringify({
      id: 'cli:tab:create',
      result: {
        type: 'tab_created',
        tab: { tab_id: 'w1:t2' },
        root_pane: { pane_id: 'w1:p2' },
      },
    })

    const { runner, commands } = recordingRunner([
      { exitCode: 0, stdout: snapshot, stderr: '' },
      { exitCode: 0, stdout: tabCreated, stderr: '' },
      { exitCode: 0, stdout: '', stderr: '' },
    ])

    const backend = createHerdrBackend({ runner, insideHerdr: true })

    expect(await backend.openEditor('/repo/api', "nvim '/repo/api'")).toBe(true)
    expect(commands).toEqual([
      ['herdr', 'api', 'snapshot'],
      [
        'herdr',
        'tab',
        'create',
        '--workspace',
        'w1',
        '--cwd',
        '/repo/api',
        '--label',
        'editor',
        '--focus',
      ],
      ['herdr', 'pane', 'run', 'w1:p2', "nvim '/repo/api'"],
    ])
  })
})

async function rejectionOf(run: Promise<unknown>): Promise<Error> {
  try {
    await run
  } catch (cause) {
    if (cause instanceof Error) return cause
  }

  throw new Error('Expected the operation to fail with an Error')
}
