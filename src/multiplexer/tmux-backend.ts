import type { CommandRunner } from './command'
import type {
  LiveWorkspace,
  MultiplexerBackend,
  OpenWorkspaceInput,
  WorkspaceDetails,
  WorkspaceRef,
} from './types'
import {
  createTmuxSession,
  getCurrentTmuxSessionName,
  getSessionDetails,
  getTmuxSessionDirectory,
  killTmuxSession,
  listTmuxSessions,
  renameTmuxSession,
  switchTmuxSession,
} from '../tmux'

export interface TmuxBackendOptions {
  runner: CommandRunner
  insideTmux: boolean
}

export function createTmuxBackend(options: TmuxBackendOptions): MultiplexerBackend {
  return {
    kind: 'tmux',
    capabilities: { previousWorkspace: true },
    async list(): Promise<LiveWorkspace[]> {
      return (await listTmuxSessions()).map(item => ({
        backend: 'tmux',
        id: item.title,
        title: item.title,
        path: item.path,
        isActive: item.isAttached === true,
        unitCount: Number.parseInt(item.windowCount ?? '0', 10),
        createdAt: item.createdAt,
        lastActivity: item.lastActivity,
      }))
    },
    async open(workspace: WorkspaceRef): Promise<void> {
      await switchTmuxSession(workspace.id)
    },
    async openOrCreate(input: OpenWorkspaceInput): Promise<void> {
      await createTmuxSession(input.title, input.path, { startupCommand: input.startupCommand })
    },
    async rename(workspace: WorkspaceRef, title: string): Promise<void> {
      await renameTmuxSession(workspace.id, title)
    },
    async close(workspace: WorkspaceRef): Promise<void> {
      await killTmuxSession(workspace.id)
    },
    async current(): Promise<WorkspaceRef | undefined> {
      const title = await getCurrentTmuxSessionName()
      return { backend: 'tmux', id: title, title }
    },
    async directory(workspace: WorkspaceRef): Promise<string | undefined> {
      return getTmuxSessionDirectory(workspace.id)
    },
    async details(workspace: WorkspaceRef): Promise<WorkspaceDetails> {
      const details = await getSessionDetails(workspace.id)
      return {
        workspace,
        isActive: details.isAttached,
        unitLabel: 'Windows',
        units: details.windows.map(window => ({
          id: window.index,
          name: window.name,
          currentPath: window.currentPath,
          currentCommand: window.currentCommand,
        })),
        previewLines: details.panePreviewLines,
        agents: [],
      }
    },
    async openEditor(path: string, command: string): Promise<boolean> {
      if (!options.insideTmux) {
        return false
      }
      const result = await options.runner.run(['tmux', 'new-window', '-c', path, command])
      if (result.exitCode !== 0) {
        throw new Error(`Failed to open tmux editor window: ${result.stderr.trim()}`)
      }
      return true
    },
  }
}
