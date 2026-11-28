import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createCommandRunner, type CommandRunner } from '../src/multiplexer/command'
import { createTmuxBackend } from '../src/multiplexer/tmux-backend'

// mux-sesh launched without a UTF-8 locale (LANG unset or C: minimal launchers, cron, containers).
// tmux then sanitizes captured output, rewriting the U+001F field separator and non-ASCII names.
// Only a harness-owned server is touched: its socket, HOME, and config live in a temporary directory.
const tmuxAvailable = Bun.which('tmux') !== null
const socketName = `locale-${process.pid}`
const sandbox = { root: '' }

function runnerWith(env: Readonly<Record<string, string>>): CommandRunner {
  const base = createCommandRunner()

  return {
    run: (command, options) => base.run(command, { ...options, env: { ...options?.env, ...env } }),
  }
}

function isolated() {
  return { TMUX_TMPDIR: sandbox.root, HOME: sandbox.root, XDG_CONFIG_HOME: sandbox.root }
}

const C_LOCALE = { LC_ALL: 'C', LC_CTYPE: 'C', LANG: 'C' }

beforeAll(async () => {
  if (!tmuxAvailable) return

  sandbox.root = await realpath(await mkdtemp(join(tmpdir(), 'mux-sesh-locale-')))

  const result = await runnerWith({ ...isolated(), LANG: 'C.UTF-8', SHELL: '/bin/sh' }).run([
    'tmux',
    '-u',
    '-L',
    socketName,
    '-f',
    '/dev/null',
    'new-session',
    '-d',
    '-s',
    'café',
    '-c',
    sandbox.root,
  ])

  if (result.exitCode !== 0) throw new Error(`Fixture tmux new-session failed: ${result.stderr}`)
})

afterAll(async () => {
  if (!sandbox.root) return

  await runnerWith(isolated()).run(['tmux', '-L', socketName, 'kill-server'])
  await rm(sandbox.root, { recursive: true, force: true })
})

describe.skipIf(!tmuxAvailable)('tmux backend in a non-UTF-8 locale', () => {
  test('lists, creates, and reads sessions with their real ids and names', async () => {
    const backend = createTmuxBackend({
      runner: runnerWith({ ...isolated(), ...C_LOCALE }),
      insideTmux: false,
      socketName,
    })

    const receipt = await backend.create({ title: 'naïve', path: sandbox.root })
    const listed = await backend.list()

    expect(listed.map(session => session.title)).toEqual(['café', 'naïve'])
    expect(listed.map(session => session.id)).toContain(receipt.workspace.id)
    expect(listed.every(session => session.path === sandbox.root)).toBe(true)
  })

  test('the attach handoff keeps the user locale instead of forcing UTF-8', async () => {
    const backend = createTmuxBackend({
      runner: runnerWith({ ...isolated(), ...C_LOCALE }),
      insideTmux: false,
      socketName,
    })

    const [session] = await backend.list()

    if (!session) throw new Error('The fixture session was not listed')

    const outcome = await backend.open(session)

    expect(outcome.kind === 'handoff' ? outcome.handoff.command : []).toEqual([
      'tmux',
      '-L',
      socketName,
      'attach-session',
      '-t',
      session.id,
    ])
  })
})
