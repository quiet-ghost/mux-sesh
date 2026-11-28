import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createCommandRunner } from '../src/multiplexer/command'

// The owned child can die while another process keeps its output pipes open: a background
// grandchild here, or a stopped tmux server holding the fds its client passed to it.
let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mux-sesh-deadline-'))
})

afterEach(async () => {
  const pid = Number(await readFile(join(directory, 'holder'), 'utf8').catch(() => '0'))

  if (pid > 0) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone: nothing of the fixture is left to stop.
    }
  }

  await rm(directory, { recursive: true, force: true })
})

test('a deadline still bounds the call when another process holds the output pipes', async () => {
  const runner = createCommandRunner({ timeoutMs: 150, killGraceMs: 100 })
  const holder = join(directory, 'holder')
  const started = Date.now()

  const failure = await runner
    .run(['/bin/sh', '-c', `sleep 30 & echo $! > '${holder}'; exec sleep 30`])
    .then(
      () => new Error('Expected the command to time out'),
      (cause: Error) => cause
    )

  expect(failure).toMatchObject({ _tag: 'CommandTimeoutError', timeoutMs: 150 })
  expect(Date.now() - started).toBeLessThan(2000)
}, 10000)
