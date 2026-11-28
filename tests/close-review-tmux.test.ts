import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, realpath, rm, writeFile } from 'fs/promises'
import { tmpdir, userInfo } from 'os'
import { join } from 'path'
import { handleCloseBatch, handleKillSession } from '../src/app/session-actions'
import { createCommandRunner } from '../src/multiplexer/command'
import { workspaceToItem } from '../src/multiplexer/items'
import { createTmuxBackend } from '../src/multiplexer/tmux-backend'
import { CleanupBatch } from '../src/sessions/cleanup-batch'
import { CleanupPlan } from '../src/sessions/cleanup-plan'

// Only a harness-owned server on its own socket is touched; the user's tmux server never is.
const socketName = `mux-sesh-close-review-${process.pid}-${Date.now()}`
const runner = createCommandRunner()
const tmuxAvailable = Bun.which('tmux') !== null
let directory = ''

async function ownedTmux(...args: string[]): Promise<void> {
  const result = await runner.run(['tmux', '-L', socketName, '-f', '/dev/null', ...args])

  if (result.exitCode !== 0) throw new Error(`Fixture tmux command failed: ${result.stderr}`)
}

beforeAll(async () => {
  if (!tmuxAvailable) return

  directory = await realpath(await mkdtemp(join(tmpdir(), 'mux-sesh-close-review-')))
  await writeFile(join(directory, 'keep.txt'), 'user data')
  // 'alpha' is a prefix of 'alpha-2', so a name-based close could hit the wrong session.
  await ownedTmux('new-session', '-d', '-s', 'alpha-2', '-c', directory, 'sleep', '600')
  await ownedTmux('new-session', '-d', '-s', 'alpha', '-c', directory, 'sleep', '600')

  for (const name of ['bravo', 'charlie', 'keep']) {
    await ownedTmux('new-session', '-d', '-s', name, '-c', directory, 'sleep', '600')
  }
})

afterAll(async () => {
  if (!tmuxAvailable) return

  await runner.run(['tmux', '-L', socketName, 'kill-server'])
  await rm(directory, { recursive: true, force: true })
  await rm(join(process.env.TMUX_TMPDIR ?? '/tmp', `tmux-${userInfo().uid}`, socketName), {
    force: true,
  })
})

describe.skipIf(!tmuxAvailable)('reviewed close against an isolated tmux server', () => {
  const backend = createTmuxBackend({ runner, insideTmux: false, socketName })

  test('closes exactly the reviewed session and leaves its files and siblings alone', async () => {
    const items = (await backend.list()).map(workspaceToItem)
    const alpha = items.find(item => item.title === 'alpha')

    if (!alpha) throw new Error('The fixture session was not listed')

    const review = CleanupPlan.review(alpha, items, 1)

    if (review.kind === 'refused') throw new Error(review.reason)

    const outcome = await handleKillSession(review.plan, backend, {
      refreshItems: async () => {},
      regularSessions: items,
      rememberedSessions: () => {},
    })

    expect(outcome).toEqual({ kind: 'completed', message: "Session 'alpha' closed" })
    expect((await backend.list()).map(session => session.title)).toEqual([
      'alpha-2',
      'bravo',
      'charlie',
      'keep',
    ])
    expect(await readdir(directory)).toEqual(['keep.txt'])
  })

  test('a batch reports a target that vanished under it and leaves unmarked sessions alone', async () => {
    const items = (await backend.list()).map(workspaceToItem)
    const marked = items.filter(item => item.title === 'bravo' || item.title === 'charlie')
    const review = CleanupBatch.review(marked, items, 1, { kind: 'known', id: undefined })

    if (review.kind === 'refused') throw new Error(review.reason)

    // charlie is closed outside mux-sesh after the review, so its own close finds nothing.
    await ownedTmux('kill-session', '-t', 'charlie')

    const outcome = await handleCloseBatch(review.batch, backend, {
      sessionItems: items,
      revision: 1,
      reloadSessions: async () => (await backend.list()).map(workspaceToItem),
    })

    if (outcome.kind !== 'receipt') throw new Error(`Expected a receipt, got ${outcome.kind}`)

    expect(outcome.receipt.results.map(result => [result.plan.ref.title, result.kind])).toEqual([
      ['bravo', 'closed'],
      ['charlie', 'disappeared'],
    ])
    expect((await backend.list()).map(session => session.title)).toEqual(['alpha-2', 'keep'])
    expect(await readdir(directory)).toEqual(['keep.txt'])
  })
})
