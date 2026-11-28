import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'fs/promises'
import { tmpdir, userInfo } from 'os'
import { join } from 'path'
import { createCommandRunner } from '../src/multiplexer/command'
import { createTmuxBackend } from '../src/multiplexer/tmux-backend'

// Only a harness-owned server on its own socket is touched; the user's tmux server never is.
const socketName = `mux-sesh-test-${process.pid}-${Date.now()}`
const runner = createCommandRunner()
const tmuxAvailable = Bun.which('tmux') !== null
let directory = ''

async function ownedTmux(...args: string[]): Promise<void> {
  const result = await runner.run(['tmux', '-L', socketName, '-f', '/dev/null', ...args])

  if (result.exitCode !== 0) throw new Error(`Fixture tmux command failed: ${result.stderr}`)
}

beforeAll(async () => {
  if (!tmuxAvailable) return

  directory = await realpath(await mkdtemp(join(tmpdir(), 'mux-sesh-tmux-')))
  // Run the pane command directly (no shell), so the fixture does not depend on the runner's $SHELL.
  await ownedTmux('new-session', '-d', '-s', 'alpha', '-c', directory, 'sleep', '600')
  await ownedTmux('new-session', '-d', '-s', 'alpha-2', '-c', directory, 'sleep', '600')
})

afterAll(async () => {
  if (!tmuxAvailable) return

  await runner.run(['tmux', '-L', socketName, 'kill-server'])
  await rm(directory, { recursive: true, force: true })
  await rm(join(process.env.TMUX_TMPDIR ?? '/tmp', `tmux-${userInfo().uid}`, socketName), {
    force: true,
  })
})

describe.skipIf(!tmuxAvailable)('tmux backend against an isolated server', () => {
  const backend = createTmuxBackend({ runner, insideTmux: false, socketName })

  test('lists, renames by id, reads details, and closes the exact session', async () => {
    const listed = await backend.list()
    const alpha = listed.find(session => session.title === 'alpha')

    expect(listed.map(session => session.title).sort()).toEqual(['alpha', 'alpha-2'])

    if (!alpha) throw new Error('The fixture session was not listed')
    expect(alpha.id).toMatch(/^\$\d+$/)

    await backend.rename(alpha, 'renamed.one')

    const renamed = (await backend.list()).find(session => session.id === alpha.id)
    expect(renamed?.title).toBe('renamed_one')

    // session_path is the -c start directory. pane_current_path follows the pane's process and
    // some tmux builds (e.g. CI) report the creating client's directory, so only its shape is checked.
    expect(alpha.path).toBe(directory)
    expect(await backend.directory(alpha)).toStartWith('/')

    const details = await backend.details(alpha)
    expect(details.isActive).toBe(false)
    expect(details.units).toHaveLength(1)

    await backend.close(alpha)

    expect((await backend.list()).map(session => session.title)).toEqual(['alpha-2'])
  })

  test('closing the last session leaves an empty inventory, not an error', async () => {
    for (const session of await backend.list()) await backend.close(session)

    expect(await backend.list()).toEqual([])
  })
})
