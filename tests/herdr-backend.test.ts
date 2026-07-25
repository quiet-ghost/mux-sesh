import { describe, expect, test } from 'bun:test'
import { createHerdrBackend, type CommandOptions, type CommandRunner } from '../src/herdr/backend'

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

function recordingRunner(responses: Array<{ exitCode: number; stdout: string; stderr: string }>): {
  runner: CommandRunner
  commands: string[][]
  options: Array<CommandOptions | undefined>
} {
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
    },
  }
}

describe('Herdr backend', () => {
  test('lists detected agents from the Agents workspace as individual targets', async () => {
    const { runner } = recordingRunner([
      { exitCode: 0, stdout: agentsWorkspaceSnapshot, stderr: '' },
    ])
    const backend = createHerdrBackend({ runner, insideHerdr: true })

    expect(await backend.list()).toEqual([
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

    await backend.open({ backend: 'herdr', id: 'w7', title: 'duplicate label' })

    expect(commands).toEqual([['herdr', 'workspace', 'focus', 'w7'], ['herdr']])
    expect(options).toEqual([undefined, { inheritStdio: true }])
  })

  test('focuses the exact tab for an agent target', async () => {
    const response = JSON.stringify({
      id: 'cli:tab:focus',
      result: { type: 'tab_info', tab: {} },
    })
    const { runner, commands } = recordingRunner([{ exitCode: 0, stdout: response, stderr: '' }])
    const backend = createHerdrBackend({ runner, insideHerdr: true })

    await backend.open({
      backend: 'herdr',
      id: 'agents',
      title: 'pi-web',
      target: { kind: 'agent', tabId: 'agents:t2', paneId: 'agents:p2' },
    })

    expect(commands).toEqual([['herdr', 'tab', 'focus', 'agents:t2']])
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

    await expect(backend.rename(agent, 'renamed')).rejects.toThrow('Cannot rename an agent tab')
    await expect(backend.close(agent)).rejects.toThrow('Cannot close an agent tab')
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
