import { CommandOutputLimitError, CommandTimeoutError, CommandTransportError } from './command'
import { MultiplexerError } from './types'

// Expected, recoverable backend failures. Anything else thrown by a backend is a defect.
export type BackendFailure =
  CommandTransportError | CommandTimeoutError | CommandOutputLimitError | MultiplexerError

export function isBackendFailure(cause: unknown): cause is BackendFailure {
  return (
    cause instanceof CommandTransportError ||
    cause instanceof CommandTimeoutError ||
    cause instanceof CommandOutputLimitError ||
    cause instanceof MultiplexerError
  )
}
