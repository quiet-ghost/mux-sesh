import { MultiplexerError, type BackendKind, type BackendPreference } from './types'
import {
  CommandOutputLimitError,
  CommandTimeoutError,
  CommandTransportError,
  type CommandRunner,
} from './command'
import { MIN_SUPPORTED_HERDR_PROTOCOL, parseHerdrStatus } from '../herdr/protocol'

export interface BackendState {
  installed: boolean
  running: boolean
  compatible?: boolean
  // Set when auto detection could not read the status; the backend is then treated as unusable.
  problem?: string
}

export interface BackendAvailability {
  tmux: BackendState
  herdr: BackendState
}

export async function probeHerdrAvailability(runner: CommandRunner): Promise<BackendState> {
  const result = await runProbe(runner, ['herdr', 'status', '--json'])

  if (!result) return { installed: false, running: false }

  if (result.exitCode !== 0) {
    return { installed: true, running: false }
  }

  const status = parseHerdrStatus(result.stdout)

  return {
    installed: true,
    running: status.running,
    compatible:
      status.compatible === true &&
      status.protocol !== undefined &&
      status.protocol >= MIN_SUPPORTED_HERDR_PROTOCOL,
  }
}

async function runProbe(runner: CommandRunner, command: readonly string[]) {
  try {
    return await runner.run(command)
  } catch (cause) {
    if (CommandTransportError.isNotFound(cause)) return undefined

    throw cause
  }
}

// Auto detection must not fail because of a backend the user may not use.
async function probeHerdrForAutoDetection(runner: CommandRunner): Promise<BackendState> {
  try {
    return await probeHerdrAvailability(runner)
  } catch (cause) {
    if (
      cause instanceof MultiplexerError ||
      cause instanceof CommandTransportError ||
      cause instanceof CommandTimeoutError ||
      cause instanceof CommandOutputLimitError
    ) {
      return { installed: true, running: false, problem: cause.message }
    }

    throw cause
  }
}

export async function probeTmuxAvailability(runner: CommandRunner): Promise<BackendState> {
  const [tmuxVersion, tmuxServer] = await Promise.all([
    runProbe(runner, ['tmux', '-V']),
    runProbe(runner, ['tmux', 'list-sessions']),
  ])

  const installed = tmuxVersion?.exitCode === 0

  return { installed, running: installed && tmuxServer?.exitCode === 0 }
}

export async function probeBackendAvailability(
  runner: CommandRunner
): Promise<BackendAvailability> {
  const [tmux, herdr] = await Promise.all([
    probeTmuxAvailability(runner),
    probeHerdrForAutoDetection(runner),
  ])

  return { tmux, herdr }
}

export function resolveBackendKind(
  env: Readonly<Record<string, string | undefined>>,
  preference: BackendPreference | undefined,
  availability: BackendAvailability
): BackendKind {
  if (env.HERDR_ENV === '1') {
    return 'herdr'
  }

  if (env.TMUX) {
    return 'tmux'
  }

  if (preference === 'herdr') {
    if (availability.herdr.running && availability.herdr.compatible !== true) {
      throw new MultiplexerError(
        'protocol-mismatch',
        'Herdr is configured, but its client and server protocols are incompatible. Restart the Herdr server, then relaunch mux-sesh.'
      )
    }

    if (!availability.herdr.running) {
      throw new MultiplexerError(
        'server-stopped',
        'Herdr is configured, but its server is not running. Start Herdr, then relaunch mux-sesh.'
      )
    }

    return 'herdr'
  }

  if (preference === 'tmux') {
    if (!availability.tmux.installed) {
      throw new MultiplexerError(
        'unavailable',
        'tmux is configured, but its executable is unavailable. Install tmux, then relaunch mux-sesh.'
      )
    }

    return 'tmux'
  }

  if (availability.herdr.running && availability.herdr.compatible === true) {
    return 'herdr'
  }

  // An installed tmux without a server is still launchable: creating a session starts it.
  if (availability.tmux.installed) {
    return 'tmux'
  }

  const herdrNote = availability.herdr.problem
    ? ` Herdr status check failed: ${availability.herdr.problem}`
    : availability.herdr.running
      ? ' Herdr is running, but its protocol is not compatible with mux-sesh.'
      : ''

  throw new MultiplexerError(
    'unavailable',
    `No usable multiplexer backend was found. Install tmux or start Herdr, then relaunch mux-sesh.${herdrNote}`
  )
}
