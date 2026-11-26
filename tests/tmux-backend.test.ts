import { describe, expect, test } from 'bun:test'
import type { CommandOptions, CommandResult, CommandRunner } from '../src/multiplexer/command'
import { MultiplexerError } from '../src/multiplexer/types'
import { createTmuxBackend, TMUX_FIELD_SEPARATOR } from '../src/multiplexer/tmux-backend'

const SEP = TMUX_FIELD_SEPARATOR

interface RecordedCall {
  readonly command: string
  readonly interactive: boolean
}

type Reply = Partial<CommandResult>

function recordingRunner(replies: ReadonlyArray<[match: string, reply: Reply]>) {
  const calls: RecordedCall[] = []

  const runner: CommandRunner = {
    async run(command: readonly string[], options?: CommandOptions): Promise<CommandResult> {
      const joined = command.join(' ')
      calls.push({ command: joined, interactive: options?.inheritStdio === true })
      const reply = replies.find(([match]) => joined.startsWith(match))?.[1]

      if (!reply) throw new Error(`Unexpected tmux command: ${joined}`)

      return { exitCode: 0, stdout: '', stderr: '', ...reply }
    },
  }

  return { runner, calls }
}

function sessionRow(id: string, name: string, attached: number, path = `/fixture/${name}`) {
  return [id, name, String(attached), '2', '1700000000', '1700000100', path].join(SEP)
}

async function failure(run: Promise<unknown>): Promise<Error> {
  try {
    await run
  } catch (cause) {
    if (cause instanceof Error) return cause
  }

  throw new Error('Expected the tmux operation to fail with an Error')
}

describe('tmux backend inventory', () => {
  test('uses native session ids and counts every attached client', async () => {
    const { runner } = recordingRunner([
      [
        'tmux list-sessions',
        {
          stdout: [
            sessionRow('$1', 'api', 0),
            sessionRow('$7', 'api-2', 1),
            sessionRow('$9', 'web', 2),
          ]
            .join('\n')
            .concat('\n'),
        },
      ],
    ])

    const listed = await createTmuxBackend({ runner, insideTmux: false }).list()

    expect(listed.map(row => [row.id, row.title, row.isActive, row.unitCount])).toEqual([
      ['$1', 'api', false, 2],
      ['$7', 'api-2', true, 2],
      ['$9', 'web', true, 2],
    ])
  })

  test('no running server is an empty inventory, not an error', async () => {
    const { runner } = recordingRunner([
      [
        'tmux list-sessions',
        { exitCode: 1, stderr: 'no server running on /tmp/tmux-1000/default' },
      ],
    ])

    expect(await createTmuxBackend({ runner, insideTmux: false }).list()).toEqual([])
  })

  test('other list failures are reported instead of looking empty', async () => {
    const { runner } = recordingRunner([
      [
        'tmux list-sessions',
        { exitCode: 1, stderr: 'error creating /tmp/tmux-1000 (Permission denied)' },
      ],
    ])

    const error = await failure(createTmuxBackend({ runner, insideTmux: false }).list())

    expect(error).toBeInstanceOf(MultiplexerError)
    expect(error.message).toContain('Permission denied')
  })

  test('a malformed session row is rejected with an actionable error', async () => {
    const { runner } = recordingRunner([['tmux list-sessions', { stdout: 'api\t1\n' }]])

    const error = await failure(createTmuxBackend({ runner, insideTmux: false }).list())

    expect(error).toMatchObject({ code: 'invalid-response' })
  })

  test('the configured socket scopes every command', async () => {
    const { runner, calls } = recordingRunner([['tmux -L fixture list-sessions', { stdout: '' }]])

    await createTmuxBackend({ runner, insideTmux: false, socketName: 'fixture' }).list()

    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toStartWith('tmux -L fixture list-sessions -F ')
  })
})

describe('tmux backend targets', () => {
  const ref = { backend: 'tmux' as const, id: '$7', title: 'api' }

  test('focus, rename, and close target the native id, never the title', async () => {
    const { runner, calls } = recordingRunner([
      ['tmux switch-client', {}],
      ['tmux rename-session', {}],
      ['tmux kill-session', {}],
    ])

    const backend = createTmuxBackend({ runner, insideTmux: true })

    await backend.open(ref)
    await backend.rename(ref, 'api.renamed now')
    await backend.close(ref)

    expect(calls).toEqual([
      { command: 'tmux switch-client -t $7', interactive: false },
      { command: 'tmux rename-session -t $7 api_renamed_now', interactive: false },
      { command: 'tmux kill-session -t $7', interactive: false },
    ])
  })

  test('outside tmux, opening attaches interactively to the native id', async () => {
    const { runner, calls } = recordingRunner([['tmux attach-session', {}]])

    await createTmuxBackend({ runner, insideTmux: false }).open(ref)

    expect(calls).toEqual([{ command: 'tmux attach-session -t $7', interactive: true }])
  })

  test('a failed switch reports the session and the tmux reason', async () => {
    const { runner } = recordingRunner([
      ['tmux switch-client', { exitCode: 1, stderr: "can't find session: $7" }],
    ])

    const error = await failure(createTmuxBackend({ runner, insideTmux: true }).open(ref))

    expect(error).toBeInstanceOf(MultiplexerError)
    expect(error.message).toContain("'api'")
    expect(error.message).toContain("can't find session")
  })

  test('current is unknown outside tmux and read by id inside it', async () => {
    const outside = recordingRunner([])

    expect(
      await createTmuxBackend({ runner: outside.runner, insideTmux: false }).current()
    ).toBeUndefined()
    expect(outside.calls).toEqual([])

    const inside = recordingRunner([['tmux display-message', { stdout: `$7${SEP}api\n` }]])

    expect(await createTmuxBackend({ runner: inside.runner, insideTmux: true }).current()).toEqual(
      ref
    )
  })
})

describe('tmux backend creation', () => {
  test('reuses only an exact name match, not a prefix-like title', async () => {
    const { runner, calls } = recordingRunner([
      [
        'tmux list-sessions',
        { stdout: `${sessionRow('$2', 'api-old', 0)}\n${sessionRow('$3', 'api', 0)}\n` },
      ],
      ['tmux switch-client', {}],
    ])

    await createTmuxBackend({ runner, insideTmux: true }).openOrCreate({
      title: 'api',
      path: '/fixture/api',
    })

    expect(calls.map(call => call.command).slice(1)).toEqual(['tmux switch-client -t $3'])
  })

  test('create returns the native session and root pane without focusing', async () => {
    const { runner, calls } = recordingRunner([
      ['tmux new-session', { stdout: `$12${SEP}%3\n` }],
      ['tmux send-keys', {}],
    ])

    const backend = createTmuxBackend({ runner, insideTmux: false })

    const receipt = await backend.create({ title: 'my.app', path: '/fixture/app' })
    await backend.start(receipt, 'bun dev')

    expect(receipt).toEqual({
      workspace: { backend: 'tmux', id: '$12', title: 'my_app' },
      rootPaneId: '%3',
    })
    expect(calls).toEqual([
      {
        command: `tmux new-session -d -s my_app -c /fixture/app -P -F #{session_id}${SEP}#{pane_id}`,
        interactive: false,
      },
      { command: 'tmux send-keys -t %3 bun dev Enter', interactive: false },
    ])
  })

  test('creates detached, starts the command in the created pane, then focuses it', async () => {
    const { runner, calls } = recordingRunner([
      [
        'tmux list-sessions',
        { exitCode: 1, stderr: 'no server running on /tmp/tmux-1000/default' },
      ],
      ['tmux new-session', { stdout: `$12${SEP}%3\n` }],
      ['tmux send-keys', {}],
      ['tmux attach-session', {}],
    ])

    await createTmuxBackend({ runner, insideTmux: false }).openOrCreate({
      title: 'my.app',
      path: '/fixture/my app',
      startupCommand: 'nvim .',
    })

    expect(calls.slice(1)).toEqual([
      {
        command: `tmux new-session -d -s my_app -c /fixture/my app -P -F #{session_id}${SEP}#{pane_id}`,
        interactive: false,
      },
      { command: 'tmux send-keys -t %3 nvim . Enter', interactive: false },
      { command: 'tmux attach-session -t $12', interactive: true },
    ])
  })

  test('a creation reply without a session and pane id is an invalid response', async () => {
    const { runner } = recordingRunner([
      ['tmux list-sessions', { stdout: '' }],
      ['tmux new-session', { stdout: 'not-an-id\n' }],
    ])

    const error = await failure(
      createTmuxBackend({ runner, insideTmux: true }).openOrCreate({
        title: 'api',
        path: '/fixture',
      })
    )

    expect(error).toMatchObject({ code: 'invalid-response' })
  })
})

describe('tmux backend details', () => {
  test('reads windows and previews the active window by its native id', async () => {
    const { runner, calls } = recordingRunner([
      ['tmux display-message -t $7 -p #{session_attached}', { stdout: '2\n' }],
      [
        'tmux list-windows',
        {
          stdout: [
            ['@4', '1', 'shell', '/fixture/api', 'zsh', '0'].join(SEP),
            ['@5', '2', 'editor', '/fixture/api/src', 'nvim', '1'].join(SEP),
          ].join('\n'),
        },
      ],
      ['tmux capture-pane', { stdout: 'line one\n\nline two\n' }],
    ])

    const details = await createTmuxBackend({ runner, insideTmux: true }).details({
      backend: 'tmux',
      id: '$7',
      title: 'api',
    })

    expect(details.isActive).toBe(true)
    expect(details.units.map(unit => [unit.id, unit.name, unit.currentCommand])).toEqual([
      ['1', 'shell', ''],
      ['2', 'editor', 'nvim'],
    ])
    expect(details.previewLines).toEqual(['line one', 'line two'])
    expect(calls.at(-1)?.command).toBe('tmux capture-pane -p -t @5 -S -16')
  })
})
