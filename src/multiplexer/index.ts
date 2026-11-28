export type { BackendAvailability, BackendState } from './resolve'

export { MultiplexerError } from './types'

export { resolveMultiplexerBackend } from './backend'

export type { CommandOptions, CommandResult, CommandRunner } from './command'

export type {
  AgentStatus,
  BackendKind,
  BackendPreference,
  CreatedSessionReceipt,
  CreateSessionInput,
  FocusOutcome,
  TerminalHandoff,
  HerdrAgentTarget,
  LiveWorkspace,
  MultiplexerBackend,
  MultiplexerCapabilities,
  OpenWorkspaceInput,
  WorkspaceAgentDetails,
  WorkspaceDetails,
  WorkspaceRef,
  WorkspaceUnitDetails,
} from './types'
