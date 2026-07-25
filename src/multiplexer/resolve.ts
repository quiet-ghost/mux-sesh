import { MultiplexerError, type BackendKind, type BackendPreference } from './types'
import type { CommandRunner } from './command'
import { parseHerdrStatus, SUPPORTED_HERDR_PROTOCOL } from '../herdr/protocol'

export interface BackendState {
  installed: boolean
  running: boolean
  compatible?: boolean
}

export interface BackendAvailability {
  tmux: BackendState
  herdr: BackendState
}

export async function probeHerdrAvailability(runner: CommandRunner): Promise<BackendState> {
  const result = await runner.run(['herdr', 'status', '--json'])
  if (result.exitCode !== 0) {
    return { installed: result.exitCode !== 127, running: false }
  }
  const status = parseHerdrStatus(result.stdout)
  return {
    installed: true,
    running: status.running,
    compatible: status.compatible === true && status.protocol === SUPPORTED_HERDR_PROTOCOL,
  }
}

export async function probeBackendAvailability(
  runner: CommandRunner
): Promise<BackendAvailability> {
  const [tmuxVersion, tmuxServer, herdr] = await Promise.all([
    runner.run(['tmux', '-V']),
    runner.run(['tmux', 'list-sessions']),
    probeHerdrAvailability(runner),
  ])
  const tmuxInstalled = tmuxVersion.exitCode === 0

  return {
    tmux: { installed: tmuxInstalled, running: tmuxInstalled && tmuxServer.exitCode === 0 },
    herdr,
  }
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

  if (availability.tmux.running && !availability.herdr.running) {
    return 'tmux'
  }

  const herdrUsable = availability.herdr.running && availability.herdr.compatible === true

  if (herdrUsable && !availability.tmux.running) {
    return 'herdr'
  }

  if (availability.tmux.running && herdrUsable) {
    return 'tmux'
  }

  if (availability.tmux.installed) {
    return 'tmux'
  }

  throw new MultiplexerError(
    'unavailable',
    'No usable multiplexer backend was found. Install tmux or start Herdr, then relaunch mux-sesh.'
  )
}
