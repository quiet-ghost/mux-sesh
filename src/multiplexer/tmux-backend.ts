import type { CommandOptions, CommandResult, CommandRunner } from './command'
import {
  MultiplexerError,
  type CreatedSessionReceipt,
  type CreateSessionInput,
  type FocusOutcome,
  type LiveWorkspace,
  type MultiplexerBackend,
  type OpenWorkspaceInput,
  type WorkspaceDetails,
  type WorkspaceRef,
} from './types'
import { formatPanePreview, formatWindowCommand, sanitizeTmuxSessionName } from '../tmux/helpers'
import { toHomeRelativePath } from '../util/path-display'

export interface TmuxBackendOptions {
  runner: CommandRunner
  insideTmux: boolean
  // Selects an isolated tmux server (`tmux -L`). Omit to use the caller's server.
  socketName?: string
}

// Unit separator: session names and paths may contain tabs, but not this control character.
export const TMUX_FIELD_SEPARATOR = '\u001f'

const SESSION_FORMAT = [
  '#{session_id}',
  '#{session_name}',
  '#{session_attached}',
  '#{session_windows}',
  '#{session_created}',
  '#{session_activity}',
  '#{session_path}',
].join(TMUX_FIELD_SEPARATOR)

const WINDOW_FORMAT = [
  '#{window_id}',
  '#{window_index}',
  '#{window_name}',
  '#{pane_current_path}',
  '#{pane_current_command}',
  '#{window_active}',
].join(TMUX_FIELD_SEPARATOR)

const DETAILS_CACHE_TTL_MS = 4000
const SESSION_ID = /^\$\d+$/
const WINDOW_ID = /^@\d+$/
const PANE_ID = /^%\d+$/
const COUNT = /^\d+$/

// The server is absent or shutting down after its last session closed, not broken: an empty
// inventory that the next create starts.
const NO_SERVER =
  /no server running|server exited unexpectedly|error connecting to .*\(No such file or directory\)/

function invalidReply(detail: string): never {
  throw new MultiplexerError(
    'invalid-response',
    `tmux returned an unexpected reply: ${detail}. Check that a supported tmux version is installed.`
  )
}

function count(value: string, field: string): number {
  return COUNT.test(value) ? Number(value) : invalidReply(`${field} was '${value}', not a number`)
}

function parseSessionRow(row: string): LiveWorkspace {
  const fields = row.split(TMUX_FIELD_SEPARATOR)

  if (fields.length !== 7) invalidReply(`session row had ${fields.length} fields instead of 7`)

  const [id = '', title = '', attached = '', windows = '', created = '', activity = '', path = ''] =
    fields

  if (!SESSION_ID.test(id)) invalidReply(`session id was '${id}'`)

  return {
    backend: 'tmux',
    id,
    title,
    path,
    isActive: count(attached, 'session_attached') > 0,
    unitCount: count(windows, 'session_windows'),
    createdAt: count(created, 'session_created'),
    lastActivity: count(activity, 'session_activity'),
  }
}

function lines(output: string): string[] {
  return output.split('\n').filter(line => line.length > 0)
}

export function createTmuxBackend(options: TmuxBackendOptions): MultiplexerBackend {
  const detailsCache = new Map<string, { details: WorkspaceDetails; expiresAt: number }>()

  function tmuxArgv(args: readonly string[]): string[] {
    return [...(options.socketName ? ['tmux', '-L', options.socketName] : ['tmux']), ...args]
  }

  function tmux(args: readonly string[], commandOptions?: CommandOptions): Promise<CommandResult> {
    return options.runner.run(tmuxArgv(args), commandOptions)
  }

  async function tmuxOk(
    args: readonly string[],
    failure: string,
    commandOptions?: CommandOptions
  ): Promise<string> {
    const result = await tmux(args, commandOptions)

    if (result.exitCode !== 0) {
      const reason = result.stderr.trim()

      throw new MultiplexerError('command-failed', reason ? `${failure}: ${reason}` : failure)
    }

    return result.stdout
  }

  async function list(): Promise<LiveWorkspace[]> {
    const result = await tmux(['list-sessions', '-F', SESSION_FORMAT])

    if (result.exitCode !== 0) {
      if (NO_SERVER.test(result.stderr)) return []

      throw new MultiplexerError(
        'command-failed',
        `Failed to list tmux sessions: ${result.stderr.trim() || `exit code ${result.exitCode}`}`
      )
    }

    return lines(result.stdout).map(parseSessionRow)
  }

  async function open(workspace: WorkspaceRef): Promise<FocusOutcome> {
    if (options.insideTmux) {
      await tmuxOk(
        ['switch-client', '-t', workspace.id],
        `Failed to switch to tmux session '${workspace.title}'`
      )

      return { kind: 'focused' }
    }

    // Check the target while the picker can still show the error; attaching happens after teardown.
    await tmuxOk(
      ['has-session', '-t', workspace.id],
      `tmux session '${workspace.title}' is no longer available`
    )

    return {
      kind: 'handoff',
      handoff: {
        command: tmuxArgv(['attach-session', '-t', workspace.id]),
        description: `attach to tmux session '${workspace.title}'`,
      },
    }
  }

  function invalidate(): void {
    detailsCache.clear()
  }

  async function create(input: CreateSessionInput): Promise<CreatedSessionReceipt> {
    const title = sanitizeTmuxSessionName(input.title)

    const output = await tmuxOk(
      [
        'new-session',
        '-d',
        '-s',
        title,
        '-c',
        input.path,
        '-P',
        '-F',
        `#{session_id}${TMUX_FIELD_SEPARATOR}#{pane_id}`,
      ],
      `Failed to create tmux session '${title}'`
    )

    const [id = '', rootPaneId = ''] = output.trim().split(TMUX_FIELD_SEPARATOR)

    if (!SESSION_ID.test(id) || !PANE_ID.test(rootPaneId)) {
      invalidReply(`new-session printed '${output.trim()}' instead of a session and pane id`)
    }

    invalidate()

    return { workspace: { backend: 'tmux', id, title }, rootPaneId }
  }

  async function start(receipt: CreatedSessionReceipt, command: string): Promise<void> {
    await tmuxOk(
      ['send-keys', '-t', receipt.rootPaneId, command, 'Enter'],
      `Created tmux session '${receipt.workspace.title}', but its startup command could not be sent`
    )
  }

  return {
    kind: 'tmux',
    capabilities: { previousWorkspace: true },
    list,
    open,
    create,
    start,
    async openOrCreate(input: OpenWorkspaceInput): Promise<FocusOutcome> {
      const title = sanitizeTmuxSessionName(input.title)
      const existing = (await list()).find(session => session.title === title)

      if (existing) return open(existing)

      const receipt = await create(input)

      if (input.startupCommand) await start(receipt, input.startupCommand)

      return open(receipt.workspace)
    },
    async rename(workspace: WorkspaceRef, title: string): Promise<WorkspaceRef> {
      const applied = sanitizeTmuxSessionName(title)

      await tmuxOk(
        ['rename-session', '-t', workspace.id, applied],
        `Failed to rename tmux session '${workspace.title}'`
      )
      invalidate()

      return { backend: 'tmux', id: workspace.id, title: applied }
    },
    async close(workspace: WorkspaceRef): Promise<void> {
      await tmuxOk(
        ['kill-session', '-t', workspace.id],
        `Failed to close tmux session '${workspace.title}'`
      )
      invalidate()
    },
    async current(): Promise<WorkspaceRef | undefined> {
      if (!options.insideTmux) return undefined

      const output = await tmuxOk(
        ['display-message', '-p', `#{session_id}${TMUX_FIELD_SEPARATOR}#{session_name}`],
        'Failed to read the current tmux session'
      )

      const [id = '', title = ''] = output.trim().split(TMUX_FIELD_SEPARATOR)

      if (!SESSION_ID.test(id)) invalidReply(`current session id was '${id}'`)

      return { backend: 'tmux', id, title }
    },
    async directory(workspace: WorkspaceRef): Promise<string | undefined> {
      const output = await tmuxOk(
        ['display-message', '-t', workspace.id, '-p', '#{pane_current_path}'],
        `Failed to read the directory of tmux session '${workspace.title}'`
      )

      return output.trim() || undefined
    },
    async details(workspace: WorkspaceRef): Promise<WorkspaceDetails> {
      const cached = detailsCache.get(workspace.id)

      if (cached && cached.expiresAt > Date.now()) return cached.details

      const failure = `Failed to read tmux session '${workspace.title}'`

      const attached = (
        await tmuxOk(['display-message', '-t', workspace.id, '-p', '#{session_attached}'], failure)
      ).trim()

      const windows = lines(
        await tmuxOk(['list-windows', '-t', workspace.id, '-F', WINDOW_FORMAT], failure)
      ).map(row => {
        const [windowId = '', index = '', name = '', path = '', command = '', active = ''] =
          row.split(TMUX_FIELD_SEPARATOR)

        if (!WINDOW_ID.test(windowId)) invalidReply(`window id was '${windowId}'`)

        return {
          windowId,
          active: active === '1',
          unit: {
            id: index,
            name,
            currentPath: toHomeRelativePath(path),
            currentCommand: formatWindowCommand(command),
          },
        }
      })

      const activeWindow = windows.find(window => window.active)

      // A missing preview leaves the details usable; the inventory and window list still stand.
      const preview = activeWindow
        ? await tmux(['capture-pane', '-p', '-t', activeWindow.windowId, '-S', '-16'])
        : undefined

      const previewLines = preview?.exitCode === 0 ? formatPanePreview(preview.stdout) : undefined

      const details: WorkspaceDetails = {
        workspace,
        isActive: count(attached, 'session_attached') > 0,
        unitLabel: 'Windows',
        units: windows.map(window => window.unit),
        previewLines: previewLines && previewLines.length > 0 ? previewLines : undefined,
        agents: [],
      }

      detailsCache.set(workspace.id, { details, expiresAt: Date.now() + DETAILS_CACHE_TTL_MS })

      return details
    },
    async openEditor(path: string, command: string): Promise<boolean> {
      if (!options.insideTmux) return false

      await tmuxOk(['new-window', '-c', path, command], 'Failed to open a tmux editor window')

      return true
    },
  }
}
