import { describe, expect, test } from 'bun:test'
import {
  probeBackendAvailability,
  resolveBackendKind,
  type BackendAvailability,
} from '../src/multiplexer/resolve'
import type { CommandRunner } from '../src/herdr/backend'
import { resolveMultiplexerBackend } from '../src/multiplexer'

const unavailable: BackendAvailability = {
  tmux: { installed: false, running: false },
  herdr: { installed: false, running: false },
}

describe('resolveBackendKind', () => {
  test('Herdr context wins when both multiplexer markers are inherited', () => {
    expect(
      resolveBackendKind({ HERDR_ENV: '1', TMUX: '/tmp/tmux.sock,1,0' }, undefined, unavailable)
    ).toBe('herdr')
  })

  test('tmux context wins without a Herdr pane marker', () => {
    expect(resolveBackendKind({ TMUX: '/tmp/tmux.sock,1,0' }, 'herdr', unavailable)).toBe('tmux')
  })

  test('explicit backend must be usable', () => {
    expect(() => resolveBackendKind({}, 'herdr', unavailable)).toThrow(
      'Herdr is configured, but its server is not running'
    )
  })

  test('explicit Herdr requires proven protocol compatibility', () => {
    expect(() =>
      resolveBackendKind({}, 'herdr', {
        tmux: { installed: true, running: false },
        herdr: { installed: true, running: true },
      })
    ).toThrow('protocols are incompatible')
  })

  test('selects the only running backend outside a multiplexer', () => {
    expect(
      resolveBackendKind({}, undefined, {
        tmux: { installed: true, running: false },
        herdr: { installed: true, running: true, compatible: true },
      })
    ).toBe('herdr')
  })

  test('prefers compatible Herdr when both servers run', () => {
    expect(
      resolveBackendKind({}, undefined, {
        tmux: { installed: true, running: true },
        herdr: { installed: true, running: true, compatible: true },
      })
    ).toBe('herdr')
  })

  test('uses running tmux when Herdr compatibility is unproven', () => {
    expect(
      resolveBackendKind({}, undefined, {
        tmux: { installed: true, running: true },
        herdr: { installed: true, running: true },
      })
    ).toBe('tmux')
  })

  test('uses installed tmux when neither server runs', () => {
    expect(
      resolveBackendKind({}, undefined, {
        tmux: { installed: true, running: false },
        herdr: { installed: true, running: false },
      })
    ).toBe('tmux')
  })

  test('reports when no usable backend exists', () => {
    expect(() => resolveBackendKind({}, undefined, unavailable)).toThrow(
      'No usable multiplexer backend was found'
    )
  })

  test('probes tmux installation/server and Herdr JSON status', async () => {
    const runner: CommandRunner = {
      async run(command) {
        const key = command.join(' ')

        if (key === 'tmux -V') return { exitCode: 0, stdout: 'tmux 3.5a', stderr: '' }

        if (key === 'tmux list-sessions') return { exitCode: 1, stdout: '', stderr: 'no server' }

        if (key === 'herdr status --json') {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              client: { version: '0.7.5', protocol: 17, binary: '/bin/herdr', channel: 'stable' },
              server: {
                status: 'running',
                running: true,
                version: '0.7.5',
                protocol: 17,
                compatible: true,
                socket: '/tmp/herdr.sock',
              },
              update: { restart_needed: false },
            }),
            stderr: '',
          }
        }

        return { exitCode: 127, stdout: '', stderr: 'not found' }
      },
    }

    expect(await probeBackendAvailability(runner)).toEqual({
      tmux: { installed: true, running: false },
      herdr: { installed: true, running: true, compatible: true },
    })
  })

  test('accepts newer compatible Herdr protocols', async () => {
    const runner: CommandRunner = {
      async run(command) {
        if (command[0] === 'tmux') return { exitCode: 127, stdout: '', stderr: 'not found' }

        return {
          exitCode: 0,
          stdout: JSON.stringify({
            client: { version: '0.8.0', protocol: 19 },
            server: { running: true, compatible: true, protocol: 19 },
            update: {},
          }),
          stderr: '',
        }
      },
    }

    expect((await probeBackendAvailability(runner)).herdr).toEqual({
      installed: true,
      running: true,
      compatible: true,
    })
  })

  test('rejects a compatible Herdr server on an unsupported protocol', async () => {
    const runner: CommandRunner = {
      async run(command) {
        if (command[0] === 'tmux') return { exitCode: 127, stdout: '', stderr: 'not found' }

        return {
          exitCode: 0,
          stdout: JSON.stringify({
            client: {},
            server: { running: true, compatible: true, protocol: 16 },
            update: {},
          }),
          stderr: '',
        }
      },
    }

    expect((await probeBackendAvailability(runner)).herdr).toEqual({
      installed: true,
      running: true,
      compatible: false,
    })
  })

  test('does not probe tmux when launched inside Herdr', async () => {
    const commands: string[][] = []

    const backend = await resolveMultiplexerBackend({
      env: { HERDR_ENV: '1', HERDR_SOCKET_PATH: '/tmp/herdr.sock' },
      runner: {
        async run(command) {
          commands.push([...command])

          return {
            exitCode: 0,
            stdout: JSON.stringify({
              client: {},
              server: { running: true, compatible: true, protocol: 17 },
              update: {},
            }),
            stderr: '',
          }
        },
      },
    })

    expect(backend.kind).toBe('herdr')
    expect(commands).toEqual([['herdr', 'status', '--json']])
  })
})

const MALFORMED_HERDR_STATUS = '{"server": "not-an-object"}'

function recordingRunner(
  commands: string[],
  replies: Readonly<Record<string, { exitCode: number; stdout: string }>>
): CommandRunner {
  return {
    async run(command) {
      const key = command.join(' ')
      commands.push(key)
      const reply = replies[key]

      if (!reply) throw new Error(`Unexpected probe: ${key}`)

      return { ...reply, stderr: '' }
    },
  }
}

async function resolutionFailure(resolution: Promise<unknown>): Promise<Error> {
  try {
    await resolution
  } catch (cause) {
    if (cause instanceof Error) return cause
  }

  throw new Error('Expected backend resolution to fail with an Error')
}

const TMUX_RUNNING = {
  'tmux -V': { exitCode: 0, stdout: 'tmux 3.5a' },
  'tmux list-sessions': { exitCode: 0, stdout: 'main: 1 windows' },
}

describe('backend probe isolation', () => {
  test('explicit tmux never probes Herdr', async () => {
    const commands: string[] = []

    const backend = await resolveMultiplexerBackend({
      env: {},
      preference: 'tmux',
      runner: recordingRunner(commands, {
        ...TMUX_RUNNING,
        'herdr status --json': { exitCode: 0, stdout: MALFORMED_HERDR_STATUS },
      }),
    })

    expect(backend.kind).toBe('tmux')
    expect(commands).not.toContain('herdr status --json')
  })

  test('auto detection treats a malformed Herdr status as unusable and keeps tmux', async () => {
    const commands: string[] = []

    const backend = await resolveMultiplexerBackend({
      env: {},
      runner: recordingRunner(commands, {
        ...TMUX_RUNNING,
        'herdr status --json': { exitCode: 0, stdout: MALFORMED_HERDR_STATUS },
      }),
    })

    expect(backend.kind).toBe('tmux')
    expect(commands).toContain('herdr status --json')
  })

  test('auto detection names the Herdr probe failure when no backend is usable', async () => {
    const failure = await resolutionFailure(
      resolveMultiplexerBackend({
        env: {},
        runner: recordingRunner([], {
          'tmux -V': { exitCode: 1, stdout: '' },
          'tmux list-sessions': { exitCode: 1, stdout: '' },
          'herdr status --json': { exitCode: 0, stdout: MALFORMED_HERDR_STATUS },
        }),
      })
    )

    expect(failure.message).toMatch(/No usable multiplexer backend.*Herdr status check failed/s)
  })

  test('explicit Herdr stays strict about a malformed status', async () => {
    const failure = await resolutionFailure(
      resolveMultiplexerBackend({
        env: {},
        preference: 'herdr',
        runner: recordingRunner([], {
          'herdr status --json': { exitCode: 0, stdout: MALFORMED_HERDR_STATUS },
        }),
      })
    )

    expect(failure.message).toContain('Herdr returned an invalid response')
  })

  test('explicit Herdr does not probe tmux', async () => {
    const commands: string[] = []

    const backend = await resolveMultiplexerBackend({
      env: {},
      preference: 'herdr',
      runner: recordingRunner(commands, {
        'herdr status --json': {
          exitCode: 0,
          stdout: JSON.stringify({ server: { running: true, compatible: true, protocol: 17 } }),
        },
      }),
    })

    expect(backend.kind).toBe('herdr')
    expect(commands).toEqual(['herdr status --json'])
  })
})
