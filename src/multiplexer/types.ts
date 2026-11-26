import type { CommandOptions } from './command'

export type BackendKind = 'tmux' | 'herdr'
export type BackendPreference = BackendKind
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown'

interface WorkspaceIdentity {
  id: string
  title: string
}

export interface HerdrAgentTarget {
  kind: 'agent'
  tabId: string
  paneId: string
}

export type WorkspaceRef =
  | (WorkspaceIdentity & { backend: 'tmux' })
  | (WorkspaceIdentity & { backend: 'herdr'; target?: HerdrAgentTarget })

export type LiveWorkspace = WorkspaceRef & {
  workspaceTitle?: string
  path: string
  isActive: boolean
  unitCount: number
  createdAt?: number
  lastActivity?: number
  agentStatus?: AgentStatus
}

export interface OpenWorkspaceInput {
  title: string
  path: string
  startupCommand?: string
}

// An interactive command the entrypoint runs after the picker has released the terminal.
export interface TerminalHandoff {
  readonly command: readonly string[]
  readonly cwd?: string
  // Completes "mux-sesh could not …", e.g. "attach to tmux session 'api'".
  readonly description: string
}

// Focus never takes over the terminal; attaching from outside a multiplexer is a handoff.
export type FocusOutcome =
  { readonly kind: 'focused' } | { readonly kind: 'handoff'; readonly handoff: TerminalHandoff }

export interface CreateSessionInput {
  readonly title: string
  readonly path: string
}

// What the backend reported it created: the native session and its root pane, never guessed.
export interface CreatedSessionReceipt {
  readonly workspace: WorkspaceRef
  readonly rootPaneId: string
}

export interface WorkspaceUnitDetails {
  id: string
  name: string
  currentPath: string
  currentCommand: string
}

export interface WorkspaceAgentDetails {
  paneId: string
  name: string
  status: AgentStatus
  cwd?: string
}

export interface WorkspaceDetails {
  workspace: WorkspaceRef
  isActive: boolean
  unitLabel: 'Windows' | 'Tabs'
  units: WorkspaceUnitDetails[]
  previewLines?: string[]
  agents: WorkspaceAgentDetails[]
}

export interface MultiplexerCapabilities {
  previousWorkspace: boolean
}

export interface MultiplexerBackend {
  kind: BackendKind
  capabilities: MultiplexerCapabilities
  list(): Promise<LiveWorkspace[]>
  open(workspace: WorkspaceRef): Promise<FocusOutcome>
  openOrCreate(input: OpenWorkspaceInput): Promise<FocusOutcome>
  // Non-interactive: creates without focusing or attaching.
  create(input: CreateSessionInput): Promise<CreatedSessionReceipt>
  // Runs the command in the receipt's root pane.
  start(receipt: CreatedSessionReceipt, command: string): Promise<void>
  // Resolves to the renamed ref carrying the name the backend actually applied.
  rename(workspace: WorkspaceRef, title: string): Promise<WorkspaceRef>
  close(workspace: WorkspaceRef): Promise<void>
  current(): Promise<WorkspaceRef | undefined>
  directory(workspace: WorkspaceRef): Promise<string | undefined>
  // Reads stop when options.signal aborts.
  details(workspace: WorkspaceRef, options?: CommandOptions): Promise<WorkspaceDetails>
  openEditor(path: string, command: string): Promise<boolean>
}

export type MultiplexerErrorCode =
  | 'unavailable'
  | 'server-stopped'
  | 'protocol-mismatch'
  | 'command-failed'
  | 'invalid-response'
  | 'unsupported'

export class MultiplexerError extends Error {
  constructor(
    readonly code: MultiplexerErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'MultiplexerError'
  }
}
