import { MultiplexerError, type AgentStatus } from '../multiplexer'

export interface HerdrWorkspace {
  id: string
  label: string
  focused: boolean
  tabCount: number
  activeTabId: string
  agentStatus: AgentStatus
  worktreePath?: string
}

export interface HerdrTab {
  id: string
  workspaceId: string
  number: number
  label: string
}

export interface HerdrPane {
  id: string
  workspaceId: string
  tabId: string
  focused: boolean
  agentStatus: AgentStatus
  cwd?: string
  foregroundCwd?: string
  displayAgent?: string
  label?: string
  title?: string
}

export interface HerdrAgent {
  paneId: string
  workspaceId: string
  tabId: string
  status: AgentStatus
  name?: string
  agent?: string
  displayAgent?: string
  cwd?: string
  foregroundCwd?: string
}

export interface HerdrLayout {
  workspaceId: string
  tabId: string
  focusedPaneId: string
}

export interface HerdrSnapshot {
  focusedWorkspaceId?: string
  focusedTabId?: string
  focusedPaneId?: string
  workspaces: HerdrWorkspace[]
  tabs: HerdrTab[]
  panes: HerdrPane[]
  layouts: HerdrLayout[]
  agents: HerdrAgent[]
}

export interface HerdrCreatedWorkspace {
  workspaceId: string
  workspaceTitle: string
  rootPaneId: string
}

export interface HerdrCreatedTab {
  tabId: string
  rootPaneId: string
}

export interface HerdrStatus {
  running: boolean
  compatible?: boolean
  protocol?: number
}

export const SUPPORTED_HERDR_PROTOCOL = 17

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(message: string): never {
  throw new MultiplexerError(
    'invalid-response',
    `Herdr returned an invalid response: ${message}. Run 'herdr status --json' to verify the server and protocol.`
  )
}

function record(value: unknown, field: string): Record<string, unknown> {
  return isRecord(value) ? value : invalid(`expected ${field} to be an object`)
}

function array(value: unknown, field: string): unknown[] {
  return Array.isArray(value) ? value : invalid(`expected ${field} to be an array`)
}

function string(value: unknown, field: string): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : invalid(`expected ${field} to be a non-empty string`)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function number(value: unknown, field: string): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : invalid(`expected ${field} to be a number`)
}

function boolean(value: unknown, field: string): boolean {
  return typeof value === 'boolean' ? value : invalid(`expected ${field} to be a boolean`)
}

function agentStatus(value: unknown): AgentStatus {
  return value === 'idle' ||
    value === 'working' ||
    value === 'blocked' ||
    value === 'done' ||
    value === 'unknown'
    ? value
    : 'unknown'
}

function parseWorkspace(value: unknown): HerdrWorkspace {
  const raw = record(value, 'workspace')
  const worktree =
    raw.worktree === undefined ? undefined : record(raw.worktree, 'workspace.worktree')
  return {
    id: string(raw.workspace_id, 'workspace.workspace_id'),
    label: string(raw.label, 'workspace.label'),
    focused: boolean(raw.focused, 'workspace.focused'),
    tabCount: number(raw.tab_count, 'workspace.tab_count'),
    activeTabId: string(raw.active_tab_id, 'workspace.active_tab_id'),
    agentStatus: agentStatus(raw.agent_status),
    worktreePath: optionalString(worktree?.checkout_path),
  }
}

function parseTab(value: unknown): HerdrTab {
  const raw = record(value, 'tab')
  return {
    id: string(raw.tab_id, 'tab.tab_id'),
    workspaceId: string(raw.workspace_id, 'tab.workspace_id'),
    number: number(raw.number, 'tab.number'),
    label: string(raw.label, 'tab.label'),
  }
}

function parsePane(value: unknown): HerdrPane {
  const raw = record(value, 'pane')
  return {
    id: string(raw.pane_id, 'pane.pane_id'),
    workspaceId: string(raw.workspace_id, 'pane.workspace_id'),
    tabId: string(raw.tab_id, 'pane.tab_id'),
    focused: boolean(raw.focused, 'pane.focused'),
    agentStatus: agentStatus(raw.agent_status),
    cwd: optionalString(raw.cwd),
    foregroundCwd: optionalString(raw.foreground_cwd),
    displayAgent: optionalString(raw.display_agent),
    label: optionalString(raw.label),
    title: optionalString(raw.title),
  }
}

function parseAgent(value: unknown): HerdrAgent {
  const raw = record(value, 'agent')
  return {
    paneId: string(raw.pane_id, 'agent.pane_id'),
    workspaceId: string(raw.workspace_id, 'agent.workspace_id'),
    tabId: string(raw.tab_id, 'agent.tab_id'),
    status: agentStatus(raw.agent_status),
    name: optionalString(raw.name),
    agent: optionalString(raw.agent),
    displayAgent: optionalString(raw.display_agent),
    cwd: optionalString(raw.cwd),
    foregroundCwd: optionalString(raw.foreground_cwd),
  }
}

function parseLayout(value: unknown): HerdrLayout {
  const raw = record(value, 'layout')
  return {
    workspaceId: string(raw.workspace_id, 'layout.workspace_id'),
    tabId: string(raw.tab_id, 'layout.tab_id'),
    focusedPaneId: string(raw.focused_pane_id, 'layout.focused_pane_id'),
  }
}

export function parseHerdrSnapshot(output: string): HerdrSnapshot {
  const result = parseHerdrResult(output, 'session_snapshot')
  const snapshot = record(result.snapshot, 'result.snapshot')
  return {
    focusedWorkspaceId: optionalString(snapshot.focused_workspace_id),
    focusedTabId: optionalString(snapshot.focused_tab_id),
    focusedPaneId: optionalString(snapshot.focused_pane_id),
    workspaces: array(snapshot.workspaces, 'snapshot.workspaces').map(parseWorkspace),
    tabs: array(snapshot.tabs, 'snapshot.tabs').map(parseTab),
    panes: array(snapshot.panes, 'snapshot.panes').map(parsePane),
    layouts: array(snapshot.layouts, 'snapshot.layouts').map(parseLayout),
    agents: array(snapshot.agents, 'snapshot.agents').map(parseAgent),
  }
}

export function parseHerdrResult(output: string, expectedType: string): Record<string, unknown> {
  let decoded: unknown
  try {
    decoded = JSON.parse(output)
  } catch {
    invalid('output was not valid JSON')
  }

  const envelope = record(decoded, 'response')
  if (envelope.error !== undefined) {
    const error = record(envelope.error, 'error')
    const message = optionalString(error.message) ?? 'unknown Herdr API error'
    throw new MultiplexerError('command-failed', `Herdr rejected the request: ${message}`)
  }

  const result = record(envelope.result, 'result')
  if (result.type !== expectedType) {
    invalid(`expected result.type to be '${expectedType}'`)
  }

  return result
}

export function parseHerdrCreatedWorkspace(output: string): HerdrCreatedWorkspace {
  const result = parseHerdrResult(output, 'workspace_created')
  const workspace = record(result.workspace, 'result.workspace')
  const rootPane = record(result.root_pane, 'result.root_pane')
  return {
    workspaceId: string(workspace.workspace_id, 'workspace.workspace_id'),
    workspaceTitle: string(workspace.label, 'workspace.label'),
    rootPaneId: string(rootPane.pane_id, 'root_pane.pane_id'),
  }
}

export function parseHerdrCreatedTab(output: string): HerdrCreatedTab {
  const result = parseHerdrResult(output, 'tab_created')
  const tab = record(result.tab, 'result.tab')
  const rootPane = record(result.root_pane, 'result.root_pane')
  return {
    tabId: string(tab.tab_id, 'tab.tab_id'),
    rootPaneId: string(rootPane.pane_id, 'root_pane.pane_id'),
  }
}

export function parseHerdrStatus(output: string): HerdrStatus {
  let decoded: unknown
  try {
    decoded = JSON.parse(output)
  } catch {
    invalid('status output was not valid JSON')
  }
  const root = record(decoded, 'status')
  const server = record(root.server, 'status.server')
  return {
    running: boolean(server.running, 'status.server.running'),
    compatible: typeof server.compatible === 'boolean' ? server.compatible : undefined,
    protocol: typeof server.protocol === 'number' ? server.protocol : undefined,
  }
}
