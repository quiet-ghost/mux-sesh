import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

// Starts the real entry point, so it stays opt-in: MUX_SESH_PROCESS_TESTS=1 bun test tests/signal-ownership.test.ts
// Isolation: piped stdio (never the caller's terminal), a temporary HOME, and a PATH holding only
// bun, so no tmux or Herdr server can be reached and startup stops at the backend failure screen.
const enabled = process.env.MUX_SESH_PROCESS_TESTS === '1'
const repoRoot = join(import.meta.dir, '..')
const sandbox = { root: '' }

beforeAll(async () => {
  if (!enabled) return
  sandbox.root = await mkdtemp(join(tmpdir(), 'mux-sesh-signal-'))
  await mkdir(join(sandbox.root, 'home', '.config'), { recursive: true })
  await mkdir(join(sandbox.root, 'bin'))
  await symlink(process.execPath, join(sandbox.root, 'bin', 'bun'))
})

afterAll(async () => {
  if (sandbox.root) await rm(sandbox.root, { recursive: true, force: true })
})

async function drain(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    // Keep the pipe flowing so the child never blocks on a full stdout buffer.
  }
}

async function exitAfterSignal(signal: NodeJS.Signals): Promise<number | null> {
  const home = join(sandbox.root, 'home')

  const proc = Bun.spawn([process.execPath, join(repoRoot, 'src/index.tsx')], {
    cwd: sandbox.root,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_CACHE_HOME: join(home, '.cache'),
      XDG_STATE_HOME: join(home, '.local', 'state'),
      PATH: join(sandbox.root, 'bin'),
      TERM: 'xterm-256color',
      MUX_SESH_DISABLE_AUTOUPDATE: '1',
    },
  })

  const stderr = new Response(proc.stderr).arrayBuffer()
  const reader = proc.stdout.getReader()
  const output = { drained: Promise.resolve() }

  try {
    // The first frame means the renderer is up; handlers are installed right after it resolves.
    await reader.read()
    output.drained = drain(reader)
    await Bun.sleep(300)
    proc.kill(signal)

    const exited = await Promise.race([proc.exited, Bun.sleep(3000).then(() => null)])

    return exited === null ? null : proc.exitCode
  } finally {
    if (proc.exitCode === null) proc.kill('SIGKILL')
    await Promise.all([proc.exited, output.drained, stderr])
  }
}

describe.skipIf(!enabled)('process signal ownership', () => {
  test('SIGQUIT goes through app shutdown and reports the quit status', async () => {
    expect(await exitAfterSignal('SIGQUIT')).toBe(131)
  }, 10000)

  test('SIGINT keeps its interrupted status', async () => {
    expect(await exitAfterSignal('SIGINT')).toBe(130)
  }, 10000)
})
