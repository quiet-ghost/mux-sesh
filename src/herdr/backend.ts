import { resolve } from 'path'
import {
  MultiplexerError,
  type LiveWorkspace,
  type MultiplexerBackend,
  type OpenWorkspaceInput,
  type WorkspaceDetails,
  type WorkspaceRef,
} from '../multiplexer'
import type { CommandOptions, CommandRunner } from '../multiplexer/command'
import {
  parseHerdrCreatedWorkspace,
  parseHerdrCreatedTab,
  parseHerdrResult,
  parseHerdrSnapshot,
  type HerdrSnapshot,
  type HerdrWorkspace,
} from './protocol'

export type { CommandOptions, CommandRunner } from '../multiplexer/command'

export interface HerdrBackendOptions {
  runner: CommandRunner
  insideHerdr: boolean
}

const AGENTS_WORKSPACE_LABEL = 'Agents'

function isAgentTarget(workspace: WorkspaceRef): workspace is Extract<
  WorkspaceRef,
  { backend: 'herdr' }
> & {
  target: { kind: 'agent'; tabId: string; paneId: string }
} {
  return workspace.backend === 'herdr' && workspace.target?.kind === 'agent'
}

function workspacePaths(snapshot: HerdrSnapshot, workspace: HerdrWorkspace): string[] {
  const panes = snapshot.panes.filter(pane => pane.workspaceId === workspace.id)
  const activePane =
    panes.find(
      pane =>
        pane.id ===
        snapshot.layouts.find(layout => layout.tabId === workspace.activeTabId)?.focusedPaneId
    ) ??
    panes.find(pane => pane.tabId === workspace.activeTabId) ??
    panes[0]
  return [activePane?.cwd, workspace.worktreePath].filter(
    (path): path is string => typeof path === 'string' && path.length > 0
  )
}

function workspacePath(snapshot: HerdrSnapshot, workspace: HerdrWorkspace): string {
  return workspacePaths(snapshot, workspace)[0] ?? ''
}

function focusedPaneForTab(snapshot: HerdrSnapshot, tabId: string) {
  const focusedPaneId = snapshot.layouts.find(layout => layout.tabId === tabId)?.focusedPaneId
  return (
    snapshot.panes.find(pane => pane.id === focusedPaneId) ??
    snapshot.panes.find(pane => pane.tabId === tabId)
  )
}

export function createHerdrBackend(options: HerdrBackendOptions): MultiplexerBackend {
  let latestSnapshot: HerdrSnapshot | undefined

  async function snapshot(): Promise<HerdrSnapshot> {
    const result = await options.runner.run(['herdr', 'api', 'snapshot'])
    if (result.exitCode !== 0) {
      const reason = result.stderr.trim()
      throw new MultiplexerError(
        'command-failed',
        reason
          ? `Failed to load Herdr workspaces: ${reason}`
          : 'Failed to load Herdr workspaces. Run herdr status --json to verify the server.'
      )
    }
    latestSnapshot = parseHerdrSnapshot(result.stdout)
    return latestSnapshot
  }

  async function command(argv: readonly string[], expectedType: string): Promise<string> {
    const result = await options.runner.run(argv)
    if (result.exitCode !== 0) {
      const reason = result.stderr.trim()
      throw new MultiplexerError(
        'command-failed',
        reason
          ? `Herdr command failed: ${reason}`
          : `Herdr command failed: ${argv.slice(1).join(' ')}`
      )
    }
    parseHerdrResult(result.stdout, expectedType)
    return result.stdout
  }

  async function commandWithoutOutput(argv: readonly string[]): Promise<void> {
    const result = await options.runner.run(argv)
    if (result.exitCode !== 0) {
      const reason = result.stderr.trim()
      throw new MultiplexerError(
        'command-failed',
        reason
          ? `Herdr command failed: ${reason}`
          : `Herdr command failed: ${argv.slice(1).join(' ')}`
      )
    }
  }

  async function focus(workspaceId: string): Promise<void> {
    await command(['herdr', 'workspace', 'focus', workspaceId], 'workspace_info')
    latestSnapshot = undefined
  }

  async function attachIfNeeded(): Promise<void> {
    if (options.insideHerdr) {
      return
    }
    const result = await options.runner.run(['herdr'], { inheritStdio: true })
    if (result.exitCode !== 0) {
      throw new MultiplexerError(
        'command-failed',
        'Failed to attach the Herdr client. The selected workspace remains focused.'
      )
    }
  }

  return {
    kind: 'herdr',
    capabilities: { previousWorkspace: false },
    async list(): Promise<LiveWorkspace[]> {
      const state = await snapshot()
      return state.workspaces.flatMap(workspace => {
        if (workspace.label !== AGENTS_WORKSPACE_LABEL) {
          return [
            {
              backend: 'herdr' as const,
              id: workspace.id,
              title: workspace.label,
              path: workspacePath(state, workspace),
              isActive: workspace.focused,
              unitCount: workspace.tabCount,
              agentStatus: workspace.agentStatus,
            },
          ]
        }

        return state.agents
          .filter(agent => agent.workspaceId === workspace.id)
          .map(agent => {
            const pane = state.panes.find(entry => entry.id === agent.paneId)
            const tab = state.tabs.find(entry => entry.id === agent.tabId)
            return {
              backend: 'herdr' as const,
              id: workspace.id,
              title: agent.name ?? agent.displayAgent ?? agent.agent ?? tab?.label ?? 'agent',
              workspaceTitle: workspace.label,
              path:
                agent.foregroundCwd ??
                agent.cwd ??
                pane?.foregroundCwd ??
                pane?.cwd ??
                workspace.worktreePath ??
                '',
              isActive:
                workspace.focused &&
                (state.focusedPaneId === agent.paneId || state.focusedTabId === agent.tabId),
              unitCount: 1,
              agentStatus: agent.status,
              target: { kind: 'agent' as const, tabId: agent.tabId, paneId: agent.paneId },
            }
          })
      })
    },
    async open(workspace: WorkspaceRef): Promise<void> {
      if (isAgentTarget(workspace)) {
        await command(['herdr', 'tab', 'focus', workspace.target.tabId], 'tab_info')
        latestSnapshot = undefined
      } else {
        await focus(workspace.id)
      }
      await attachIfNeeded()
    },
    async openOrCreate(input: OpenWorkspaceInput): Promise<void> {
      const state = await snapshot()
      const normalizedPath = resolve(input.path)
      const existing = state.workspaces.find(
        workspace =>
          workspace.label === input.title &&
          workspacePaths(state, workspace).some(path => resolve(path) === normalizedPath)
      )
      if (existing) {
        await focus(existing.id)
        await attachIfNeeded()
        return
      }

      const output = await command(
        ['herdr', 'workspace', 'create', '--cwd', input.path, '--label', input.title, '--focus'],
        'workspace_created'
      )
      const created = parseHerdrCreatedWorkspace(output)
      if (input.startupCommand) {
        await commandWithoutOutput([
          'herdr',
          'pane',
          'run',
          created.rootPaneId,
          input.startupCommand,
        ])
      }
      latestSnapshot = undefined
      await attachIfNeeded()
    },
    async rename(workspace: WorkspaceRef, title: string): Promise<void> {
      if (isAgentTarget(workspace)) {
        throw new MultiplexerError(
          'unsupported',
          'Cannot rename an agent tab from mux-sesh. Rename it in Herdr instead.'
        )
      }
      await command(['herdr', 'workspace', 'rename', workspace.id, title], 'workspace_info')
      latestSnapshot = undefined
    },
    async close(workspace: WorkspaceRef): Promise<void> {
      if (isAgentTarget(workspace)) {
        throw new MultiplexerError(
          'unsupported',
          'Cannot close an agent tab from mux-sesh. Close it in Herdr instead.'
        )
      }
      await command(['herdr', 'workspace', 'close', workspace.id], 'ok')
      latestSnapshot = undefined
    },
    async current(): Promise<WorkspaceRef | undefined> {
      const state = latestSnapshot ?? (await snapshot())
      const workspace = state.workspaces.find(entry => entry.id === state.focusedWorkspaceId)
      return workspace ? { backend: 'herdr', id: workspace.id, title: workspace.label } : undefined
    },
    async directory(workspace: WorkspaceRef): Promise<string | undefined> {
      const state = latestSnapshot ?? (await snapshot())
      if (isAgentTarget(workspace)) {
        const pane = state.panes.find(entry => entry.id === workspace.target.paneId)
        return pane?.foregroundCwd ?? pane?.cwd
      }
      const target = state.workspaces.find(entry => entry.id === workspace.id)
      return target ? workspacePath(state, target) || undefined : undefined
    },
    async details(workspace: WorkspaceRef): Promise<WorkspaceDetails> {
      const state = latestSnapshot ?? (await snapshot())
      const target = state.workspaces.find(entry => entry.id === workspace.id)
      if (!target) {
        throw new MultiplexerError(
          'command-failed',
          `Herdr workspace '${workspace.title}' (${workspace.id}) no longer exists.`
        )
      }

      const workspaceTabs = state.tabs.filter(
        tab =>
          tab.workspaceId === workspace.id &&
          (!isAgentTarget(workspace) || tab.id === workspace.target.tabId)
      )
      const workspacePanes = state.panes.filter(pane => pane.workspaceId === workspace.id)
      const previewPane = isAgentTarget(workspace)
        ? state.panes.find(pane => pane.id === workspace.target.paneId)
        : (focusedPaneForTab(state, target.activeTabId) ?? workspacePanes[0])
      let previewLines: string[] | undefined
      if (previewPane) {
        const preview = await options.runner.run([
          'herdr',
          'pane',
          'read',
          previewPane.id,
          '--source',
          'recent-unwrapped',
          '--lines',
          '16',
        ])
        if (preview.exitCode === 0) {
          const lines = preview.stdout
            .split('\n')
            .map(line => line.trimEnd())
            .filter(line => line.length > 0)
          previewLines = lines.length > 0 ? lines : undefined
        }
      }

      return {
        workspace: isAgentTarget(workspace)
          ? workspace
          : { backend: 'herdr', id: target.id, title: target.label },
        isActive: isAgentTarget(workspace)
          ? target.focused &&
            (state.focusedPaneId === workspace.target.paneId ||
              state.focusedTabId === workspace.target.tabId)
          : target.focused,
        unitLabel: 'Tabs',
        units: workspaceTabs.map(tab => {
          const pane = focusedPaneForTab(state, tab.id)
          return {
            id: tab.id,
            name: tab.label,
            currentPath: pane?.foregroundCwd ?? pane?.cwd ?? '',
            currentCommand: pane?.displayAgent ?? pane?.label ?? pane?.title ?? '',
          }
        }),
        previewLines,
        agents: state.agents
          .filter(
            agent =>
              agent.workspaceId === workspace.id &&
              (!isAgentTarget(workspace) || agent.paneId === workspace.target.paneId)
          )
          .map(agent => ({
            paneId: agent.paneId,
            name: agent.name ?? agent.displayAgent ?? agent.agent ?? 'agent',
            status: agent.status,
            cwd: agent.foregroundCwd ?? agent.cwd,
          })),
      }
    },
    async openEditor(path: string, editorCommand: string): Promise<boolean> {
      if (!options.insideHerdr) {
        return false
      }
      const state = latestSnapshot ?? (await snapshot())
      const workspaceId = state.focusedWorkspaceId
      if (!workspaceId) {
        throw new MultiplexerError(
          'command-failed',
          'Herdr has no focused workspace for the editor tab.'
        )
      }
      const output = await command(
        [
          'herdr',
          'tab',
          'create',
          '--workspace',
          workspaceId,
          '--cwd',
          path,
          '--label',
          'editor',
          '--focus',
        ],
        'tab_created'
      )
      const created = parseHerdrCreatedTab(output)
      await commandWithoutOutput(['herdr', 'pane', 'run', created.rootPaneId, editorCommand])
      latestSnapshot = undefined
      return true
    },
  }
}
