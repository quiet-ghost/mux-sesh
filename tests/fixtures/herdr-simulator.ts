import {
  CommandInterrupted,
  CommandTimeoutError,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from '../../src/multiplexer/command'

// A scripted Herdr server for contract tests. It never runs `herdr`; replies are rendered in the
// recorded wire formats below, so no live Herdr server or workspace is ever touched.
//
// protocol-22 follows Herdr 0.9.5 (`herdr api schema`): `w<n>` workspace ids from a counter that is
// never reused, `<ws>:t<n>` tabs, `<ws>:p<n>` panes, full WorkspaceInfo/TabInfo/PaneInfo objects,
// `tokens`/`worktree` omitted when empty, and failures as exit 1 with an error envelope on stderr.
// protocol-17 is the sanitized Herdr 0.7.5 fixture already used in tests/herdr-backend.test.ts:
// only the fields the adapter reads, and mutation replies that carry ids but no workspace details.
export type HerdrProtocolFixture = 'protocol-22' | 'protocol-17'

type ServerState = 'running' | 'stopped' | 'hung'

interface SimPane {
  readonly id: string
  readonly tabId: string
  readonly workspaceId: string
  readonly terminalId: string
  readonly cwd: string
  readonly ran: string[]
}

interface SimTab {
  readonly id: string
  readonly workspaceId: string
  readonly number: number
  readonly label: string
  focusedPaneId: string
}

interface SimWorkspace {
  readonly id: string
  label: string
  readonly activeTabId: string
  nextPane: number
}

interface CreatedSimWorkspace {
  readonly ws: SimWorkspace
  readonly tab: SimTab
  readonly pane: SimPane
}

interface SimState {
  server: ServerState
  focusedWorkspaceId: string | undefined
  nextWorkspace: number
  nextTerminal: number
  readonly workspaces: SimWorkspace[]
  readonly tabs: SimTab[]
  readonly panes: SimPane[]
}

export interface SeededWorkspace {
  readonly workspaceId: string
  readonly rootPaneId: string
}

export interface HerdrSimulator {
  readonly protocol: HerdrProtocolFixture
  readonly runner: CommandRunner
  readonly commands: string[][]
  workspaceIds(): string[]
  focusedWorkspaceId(): string | undefined
  commandsRunIn(paneId: string): readonly string[]
  // Harness-side changes, as if made by the user in Herdr while mux-sesh was running.
  seed(label: string, cwd: string): SeededWorkspace
  closeExternally(workspaceId: string): void
  splitAndCloseRoot(workspaceId: string, rootPaneId: string): void
  stopServer(): void
  hang(timeoutMs: number): void
}

const PUBLIC_ID_ALPHABET = '123456789ABCDEFGHJKMNPQRSTVWXYZ0'

// Port of Herdr's encode_public_number (src/workspace.rs).
function encodePublicNumber(value: number): string {
  let rest = value
  let encoded = ''

  while (rest > 0) {
    encoded = (PUBLIC_ID_ALPHABET[(rest - 1) % PUBLIC_ID_ALPHABET.length] ?? '') + encoded
    rest = Math.floor((rest - 1) / PUBLIC_ID_ALPHABET.length)
  }

  return encoded || '0'
}

function ok(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: '' }
}

function rejected(requestId: string, code: string, message: string): CommandResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `${JSON.stringify({ id: requestId, error: { code, message } })}\n`,
  }
}

function usage(command: readonly string[]): CommandResult {
  return {
    exitCode: 2,
    stdout: '',
    stderr: `herdr simulator: unsupported command '${command.join(' ')}'\n`,
  }
}

// Approximates the CLI's connection failure; the adapter relies only on the non-zero exit.
const SERVER_STOPPED: CommandResult = {
  exitCode: 1,
  stdout: '',
  stderr:
    'error: failed to connect to herdr server at <runtime>/herdr.sock: No such file or directory (os error 2)\n',
}

export function createHerdrSimulator(protocol: HerdrProtocolFixture): HerdrSimulator {
  const commands: string[][] = []
  let hangTimeoutMs = 0

  const state: SimState = {
    server: 'running',
    focusedWorkspaceId: undefined,
    nextWorkspace: 1,
    nextTerminal: 1,
    workspaces: [],
    tabs: [],
    panes: [],
  }

  const current = protocol === 'protocol-22'

  function workspace(id: string): SimWorkspace | undefined {
    return state.workspaces.find(entry => entry.id === id)
  }

  function workspaceNumber(id: string): number {
    return state.workspaces.findIndex(entry => entry.id === id) + 1
  }

  function panesOf(workspaceId: string): SimPane[] {
    return state.panes.filter(pane => pane.workspaceId === workspaceId)
  }

  function addPane(target: SimWorkspace, tabId: string, cwd: string): SimPane {
    const pane: SimPane = {
      id: `${target.id}:p${encodePublicNumber(target.nextPane)}`,
      tabId,
      workspaceId: target.id,
      terminalId: `term-${state.nextTerminal}`,
      cwd,
      ran: [],
    }

    target.nextPane += 1
    state.nextTerminal += 1
    state.panes.push(pane)

    return pane
  }

  function createWorkspace(label: string, cwd: string): CreatedSimWorkspace {
    const id = `w${encodePublicNumber(state.nextWorkspace)}`
    const tabId = `${id}:t1`
    const ws: SimWorkspace = { id, label, activeTabId: tabId, nextPane: 1 }

    state.nextWorkspace += 1
    state.workspaces.push(ws)

    const pane = addPane(ws, tabId, cwd)

    const tab: SimTab = {
      id: tabId,
      workspaceId: id,
      number: 1,
      label: '1',
      focusedPaneId: pane.id,
    }

    state.tabs.push(tab)

    return { ws, tab, pane }
  }

  function removeWorkspace(id: string): void {
    const index = state.workspaces.findIndex(entry => entry.id === id)

    if (index < 0) return

    state.workspaces.splice(index, 1)

    for (const list of [state.tabs, state.panes]) {
      for (let at = list.length - 1; at >= 0; at -= 1) {
        if (list[at]?.workspaceId === id) list.splice(at, 1)
      }
    }

    if (state.focusedWorkspaceId === id) state.focusedWorkspaceId = state.workspaces[0]?.id
  }

  function workspaceInfo(ws: SimWorkspace) {
    return {
      workspace_id: ws.id,
      number: workspaceNumber(ws.id),
      label: ws.label,
      focused: state.focusedWorkspaceId === ws.id,
      pane_count: panesOf(ws.id).length,
      tab_count: state.tabs.filter(tab => tab.workspaceId === ws.id).length,
      active_tab_id: ws.activeTabId,
      agent_status: 'idle',
    }
  }

  function tabInfo(tab: SimTab) {
    return {
      tab_id: tab.id,
      workspace_id: tab.workspaceId,
      number: tab.number,
      label: tab.label,
      focused: state.focusedWorkspaceId === tab.workspaceId,
      pane_count: state.panes.filter(pane => pane.tabId === tab.id).length,
      agent_status: 'idle',
    }
  }

  function paneInfo(pane: SimPane) {
    const focused =
      state.focusedWorkspaceId === pane.workspaceId &&
      state.tabs.find(tab => tab.id === pane.tabId)?.focusedPaneId === pane.id

    return current
      ? {
          pane_id: pane.id,
          terminal_id: pane.terminalId,
          workspace_id: pane.workspaceId,
          tab_id: pane.tabId,
          focused,
          agent_status: 'idle',
          revision: pane.ran.length,
          cwd: pane.cwd,
          foreground_cwd: pane.cwd,
        }
      : {
          pane_id: pane.id,
          workspace_id: pane.workspaceId,
          tab_id: pane.tabId,
          focused,
          agent_status: 'idle',
          cwd: pane.cwd,
        }
  }

  function layout(tab: SimTab) {
    return current
      ? {
          workspace_id: tab.workspaceId,
          tab_id: tab.id,
          zoomed: false,
          area: { x: 0, y: 0, width: 120, height: 40 },
          focused_pane_id: tab.focusedPaneId,
          panes: state.panes
            .filter(pane => pane.tabId === tab.id)
            .map(pane => ({
              pane_id: pane.id,
              focused: pane.id === tab.focusedPaneId,
              rect: { x: 0, y: 0, width: 120, height: 40 },
            })),
          splits: [],
        }
      : { workspace_id: tab.workspaceId, tab_id: tab.id, focused_pane_id: tab.focusedPaneId }
  }

  function snapshot(): string {
    const focused = state.focusedWorkspaceId ? workspace(state.focusedWorkspaceId) : undefined
    const focusedTab = state.tabs.find(tab => tab.id === focused?.activeTabId)

    return JSON.stringify({
      id: 'cli:api:snapshot',
      result: {
        type: 'session_snapshot',
        snapshot: {
          version: current ? '0.9.5' : '0.7.5',
          protocol: current ? 22 : 17,
          focused_workspace_id: focused?.id ?? null,
          focused_tab_id: focusedTab?.id ?? null,
          focused_pane_id: focusedTab?.focusedPaneId ?? null,
          workspaces: state.workspaces.map(workspaceInfo),
          tabs: state.tabs.map(tabInfo),
          panes: state.panes.map(paneInfo),
          layouts: state.tabs.map(layout),
          agents: [],
        },
      },
    })
  }

  function workspaceInfoReply(requestId: string, ws: SimWorkspace): CommandResult {
    return ok(
      JSON.stringify({
        id: requestId,
        result: { type: 'workspace_info', workspace: current ? workspaceInfo(ws) : {} },
      })
    )
  }

  function notFound(requestId: string, workspaceId: string): CommandResult {
    return rejected(requestId, 'workspace_not_found', `workspace ${workspaceId} not found`)
  }

  function paneNotFound(requestId: string, paneId: string): CommandResult {
    return rejected(requestId, 'pane_not_found', `pane ${paneId} not found`)
  }

  function flag(args: readonly string[], name: string): string | undefined {
    const index = args.indexOf(name)

    return index >= 0 ? args[index + 1] : undefined
  }

  function workspaceCommand(command: readonly string[]): CommandResult {
    const [verb = '', target = '', ...rest] = command.slice(2)

    switch (verb) {
      case 'create': {
        const args = command.slice(3)

        const created = createWorkspace(
          flag(args, '--label') ?? 'workspace',
          flag(args, '--cwd') ?? '/'
        )

        if (args.includes('--focus')) state.focusedWorkspaceId = created.ws.id

        const reply = current
          ? {
              type: 'workspace_created',
              workspace: workspaceInfo(created.ws),
              tab: tabInfo(created.tab),
              root_pane: paneInfo(created.pane),
            }
          : {
              type: 'workspace_created',
              workspace: { workspace_id: created.ws.id, label: created.ws.label },
              tab: { tab_id: created.tab.id },
              root_pane: { pane_id: created.pane.id },
            }

        return ok(JSON.stringify({ id: 'cli:workspace:create', result: reply }))
      }

      case 'focus': {
        const ws = workspace(target)

        if (!ws) return notFound('cli:workspace:focus', target)

        state.focusedWorkspaceId = ws.id

        return workspaceInfoReply('cli:workspace:focus', ws)
      }

      case 'rename': {
        const ws = workspace(target)

        if (!ws) return notFound('cli:workspace:rename', target)

        // The real CLI joins every remaining argument with spaces.
        ws.label = rest.join(' ')

        return workspaceInfoReply('cli:workspace:rename', ws)
      }

      case 'close': {
        if (!workspace(target)) return notFound('cli:workspace:close', target)

        removeWorkspace(target)

        return ok(JSON.stringify({ id: 'cli:workspace:close', result: { type: 'ok' } }))
      }

      default:
        return usage(command)
    }
  }

  function paneCommand(command: readonly string[]): CommandResult {
    const [verb = '', paneId = '', text = ''] = command.slice(2)
    const pane = state.panes.find(entry => entry.id === paneId)

    switch (verb) {
      case 'run':
        if (!pane) return paneNotFound('cli:pane:run', paneId)

        pane.ran.push(text)

        return ok(JSON.stringify({ id: 'cli:pane:run', result: { type: 'ok' } }))
      case 'read':
        if (!pane) return paneNotFound('cli:pane:read', paneId)

        return ok(pane.ran.map(line => `$ ${line}\n`).join(''))
      default:
        return usage(command)
    }
  }

  function respond(command: readonly string[]): CommandResult {
    const [executable = '', group = '', verb = '', target = ''] = command

    if (executable !== 'herdr') return usage(command)

    if (state.server === 'stopped') return SERVER_STOPPED

    switch (group) {
      case 'api':
        return verb === 'snapshot' ? ok(snapshot()) : usage(command)
      case 'workspace':
        return workspaceCommand(command)
      case 'pane':
        return paneCommand(command)
      case 'agent': {
        const pane = state.panes.find(entry => entry.id === target)

        if (verb !== 'focus') return usage(command)

        if (!pane) return paneNotFound('cli:agent:focus', target)

        state.focusedWorkspaceId = pane.workspaceId

        return ok(
          JSON.stringify({ id: 'cli:agent:focus', result: { type: 'agent_info', agent: {} } })
        )
      }

      default:
        return usage(command)
    }
  }

  // A hung server is observed exactly as the owned runner reports it: stopped at its deadline.
  function hungReply(options: CommandOptions | undefined): Promise<CommandResult> {
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(
        () => reject(new CommandTimeoutError({ executable: 'herdr', timeoutMs: hangTimeoutMs })),
        hangTimeoutMs
      )

      options?.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(new CommandInterrupted({ executable: 'herdr' }))
        },
        { once: true }
      )
    })
  }

  return {
    protocol,
    commands,
    runner: {
      async run(command, options) {
        commands.push([...command])

        if (state.server === 'hung') return hungReply(options)

        return respond(command)
      },
    },
    workspaceIds: () => state.workspaces.map(entry => entry.id),
    focusedWorkspaceId: () => state.focusedWorkspaceId,
    commandsRunIn: paneId => state.panes.find(pane => pane.id === paneId)?.ran ?? [],
    seed(label, cwd) {
      const created = createWorkspace(label, cwd)

      state.focusedWorkspaceId ??= created.ws.id

      return { workspaceId: created.ws.id, rootPaneId: created.pane.id }
    },
    closeExternally: removeWorkspace,
    splitAndCloseRoot(workspaceId, rootPaneId) {
      const ws = workspace(workspaceId)
      const root = state.panes.find(pane => pane.id === rootPaneId)

      if (!ws || !root) throw new Error(`Simulator has no pane '${rootPaneId}' in '${workspaceId}'`)

      const sibling = addPane(ws, root.tabId, root.cwd)
      const tab = state.tabs.find(entry => entry.id === root.tabId)

      if (tab) tab.focusedPaneId = sibling.id

      state.panes.splice(state.panes.indexOf(root), 1)
    },
    stopServer() {
      state.server = 'stopped'
    },
    hang(timeoutMs) {
      hangTimeoutMs = timeoutMs
      state.server = 'hung'
    },
  }
}
