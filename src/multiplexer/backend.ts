import { createHerdrBackend } from '../herdr/backend'
import { createCommandRunner, type CommandRunner } from './command'
import {
  probeBackendAvailability,
  probeHerdrAvailability,
  probeTmuxAvailability,
  resolveBackendKind,
  type BackendAvailability,
  type BackendState,
} from './resolve'
import { createTmuxBackend } from './tmux-backend'
import { MultiplexerError, type BackendPreference, type MultiplexerBackend } from './types'

export interface ResolveMultiplexerOptions {
  preference?: BackendPreference
  env?: Readonly<Record<string, string | undefined>>
  runner?: CommandRunner
}

export async function resolveMultiplexerBackend(
  options: ResolveMultiplexerOptions = {}
): Promise<MultiplexerBackend> {
  const env = options.env ?? process.env
  const runner = options.runner ?? createCommandRunner()

  if (env.HERDR_ENV === '1') {
    const herdr = await probeHerdrAvailability(runner)

    if (!herdr.running) {
      throw new MultiplexerError(
        'server-stopped',
        'mux-sesh is running inside Herdr, but its server is unavailable.'
      )
    }

    if (herdr.compatible !== true) {
      throw new MultiplexerError(
        'protocol-mismatch',
        'The active Herdr client and server are not compatible with mux-sesh. Herdr 0.7.5 or newer with protocol 17 or newer is required.'
      )
    }

    return createHerdrBackend({ runner, insideHerdr: true })
  }

  const kind = env.TMUX
    ? 'tmux'
    : resolveBackendKind(
        env,
        options.preference,
        await probeForPreference(runner, options.preference)
      )

  return kind === 'herdr'
    ? createHerdrBackend({ runner, insideHerdr: false })
    : createTmuxBackend({ runner, insideTmux: Boolean(env.TMUX) })
}

const NOT_PROBED: BackendState = { installed: false, running: false }

// An explicit preference probes only that backend, so the other one cannot break startup.
async function probeForPreference(
  runner: CommandRunner,
  preference: BackendPreference | undefined
): Promise<BackendAvailability> {
  switch (preference) {
    case 'herdr':
      return { tmux: NOT_PROBED, herdr: await probeHerdrAvailability(runner) }
    case 'tmux':
      return { tmux: await probeTmuxAvailability(runner), herdr: NOT_PROBED }
    case undefined:
      return probeBackendAvailability(runner)
  }
}
