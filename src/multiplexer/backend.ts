import { createHerdrBackend } from '../herdr/backend'
import { createCommandRunner, type CommandRunner } from './command'
import { probeBackendAvailability, probeHerdrAvailability, resolveBackendKind } from './resolve'
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
        'The active Herdr client and server are not compatible with mux-sesh. Herdr 0.7.5 protocol 17 is required.'
      )
    }
    return createHerdrBackend({ runner, insideHerdr: true })
  }

  const contextKind = env.TMUX ? 'tmux' : undefined
  const kind =
    contextKind ??
    resolveBackendKind(env, options.preference, await probeBackendAvailability(runner))

  return kind === 'herdr'
    ? createHerdrBackend({ runner, insideHerdr: false })
    : createTmuxBackend({ runner, insideTmux: Boolean(env.TMUX) })
}
