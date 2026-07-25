export type BackendKind = 'tmux' | 'herdr'
export type BackendPreference = BackendKind
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown'

export interface WorkspaceRef {
  backend: BackendKind
  id: string
  title: string
}

export interface LiveWorkspace extends WorkspaceRef {
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
  open(workspace: WorkspaceRef): Promise<void>
  openOrCreate(input: OpenWorkspaceInput): Promise<void>
  rename(workspace: WorkspaceRef, title: string): Promise<void>
  close(workspace: WorkspaceRef): Promise<void>
  current(): Promise<WorkspaceRef | undefined>
  directory(workspace: WorkspaceRef): Promise<string | undefined>
  details(workspace: WorkspaceRef): Promise<WorkspaceDetails>
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
