export { probeBackendAvailability, probeHerdrAvailability, resolveBackendKind } from './resolve'
export type { BackendAvailability, BackendState } from './resolve'
export { MultiplexerError } from './types'
export { createCommandRunner } from './command'
export { resolveMultiplexerBackend } from './backend'
export { createTmuxBackend } from './tmux-backend'
export type { CommandOptions, CommandResult, CommandRunner } from './command'
export type {
  AgentStatus,
  BackendKind,
  BackendPreference,
  LiveWorkspace,
  MultiplexerBackend,
  MultiplexerCapabilities,
  OpenWorkspaceInput,
  WorkspaceAgentDetails,
  WorkspaceDetails,
  WorkspaceRef,
  WorkspaceUnitDetails,
} from './types'
