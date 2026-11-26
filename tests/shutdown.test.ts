import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import { pathToFileURL } from 'url'

const repoRoot = join(import.meta.dir, '..')

async function waitForExit(proc: Bun.Subprocess, timeoutMs: number): Promise<number | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      proc.exited.then(() => proc.exitCode ?? 0),
      new Promise<null>(resolve => {
        timeout = setTimeout(() => resolve(null), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

describe('shutdown', () => {
  test('flushes React effect cleanup before exiting the process', async () => {
    const proc = Bun.spawn(
      [process.execPath, join(import.meta.dir, 'fixtures/shutdown-react.tsx')],
      {
        cwd: repoRoot,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 5000,
        killSignal: 'SIGKILL',
      }
    )

    try {
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])

      expect(stderr).toBe('')
      expect(exitCode).toBe(0)
      const report: unknown = JSON.parse(stdout)
      expect(report).toEqual({ destroyed: true, lifecycle: ['mounted', 'unmounted'] })
    } finally {
      if (proc.exitCode === null) proc.kill('SIGKILL')
      await proc.exited
    }
  }, 10000)

  test('exits immediately even when the event loop has active handles', async () => {
    const shutdownModule = pathToFileURL(join(repoRoot, 'src/util/shutdown.ts')).href

    const script = `
      import { requestShutdown } from ${JSON.stringify(shutdownModule)}
      setTimeout(() => {}, 5000)
      await requestShutdown(7)
    `

    const proc = Bun.spawn([process.execPath, '--eval', script], {
      cwd: repoRoot,
      stdout: 'ignore',
      stderr: 'ignore',
    })

    const exitCode = await waitForExit(proc, 500)

    if (exitCode === null) {
      proc.kill()
      await proc.exited
    }

    expect(exitCode).toBe(7)
  })

  test('fatal rejection prints diagnostics and exits despite active handles', async () => {
    const shutdownModule = pathToFileURL(join(repoRoot, 'src/util/shutdown.ts')).href

    const script = `
      import { initializeFatalErrorHandling } from ${JSON.stringify(shutdownModule)}
      initializeFatalErrorHandling()
      setInterval(() => {}, 5000)
      Promise.reject(new Error('fatal rename failure'))
    `

    const proc = Bun.spawn([process.execPath, '--eval', script], {
      cwd: repoRoot,
      stdout: 'ignore',
      stderr: 'pipe',
    })

    const stderrPromise = new Response(proc.stderr).text()

    const exitCode = await waitForExit(proc, 1000)

    if (exitCode === null) proc.kill()
    await proc.exited
    const stderr = await stderrPromise

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Fatal unhandled rejection')
    expect(stderr).toContain('fatal rename failure')
    expect(stderr).toContain('quiet-ghost/mux-sesh/issues/new')
  })

  test('fatal output sanitizes the report and never serializes hostile rejection values', async () => {
    const shutdownModule = pathToFileURL(join(repoRoot, 'src/util/shutdown.ts')).href

    const script = `
      import { requestFatalShutdown } from ${JSON.stringify(shutdownModule)}
      const cause = new Proxy({}, {
        get() { throw new Error('fixture-hostile-secret') },
        getPrototypeOf() { throw new Error('fixture-prototype-secret') }
      })
      const error = new Error('launch failed: token=fixture-fatal-secret', { cause })
      error.stack = 'at request https://user:fixture-fatal-url-secret@example.test/private'
      requestFatalShutdown(error)
    `

    const proc = Bun.spawn([process.execPath, '--eval', script], {
      cwd: repoRoot,
      stdout: 'ignore',
      stderr: 'pipe',
      timeout: 5000,
      killSignal: 'SIGKILL',
    })

    try {
      const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
      expect(exitCode).toBe(1)
      expect(stderr).toContain('launch failed')
      expect(stderr).toContain('details omitted')
      expect(stderr).not.toContain('fixture-fatal-secret')
      expect(stderr).not.toContain('fixture-fatal-url-secret')
      expect(stderr).not.toContain('fixture-hostile-secret')
      expect(stderr).not.toContain('fixture-prototype-secret')
      // oxlint-disable-next-line no-control-regex -- Asserts raw control characters are absent.
      expect(stderr).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/)
      const issueLine = stderr.trim().split('\n').at(-1)

      if (!issueLine) throw new Error('Fatal output did not include the sanitized issue URL')
      expect(new URL(issueLine).searchParams.get('body')).not.toContain('fixture-fatal-secret')
    } finally {
      if (proc.exitCode === null) proc.kill('SIGKILL')
      await proc.exited
    }
  }, 10000)

  test('ignores duplicate fatal events', async () => {
    const shutdownModule = pathToFileURL(join(repoRoot, 'src/util/shutdown.ts')).href

    const script = `
      import { requestFatalShutdown } from ${JSON.stringify(shutdownModule)}
      const originalExit = process.exit
      let exits = 0
      process.exit = (() => { exits += 1 }) as typeof process.exit
      requestFatalShutdown(new Error('first fatal'))
      requestFatalShutdown(new Error('second fatal'))
      process.exit = originalExit
      originalExit(exits === 1 ? 0 : 9)
    `

    const proc = Bun.spawn([process.execPath, '--eval', script], {
      cwd: repoRoot,
      stdout: 'ignore',
      stderr: 'pipe',
    })

    const stderrPromise = new Response(proc.stderr).text()
    const exitCode = await waitForExit(proc, 1000)

    if (exitCode === null) proc.kill()
    await proc.exited
    const stderr = await stderrPromise

    expect(exitCode).toBe(0)
    expect(stderr.match(/^Fatal /gm)).toHaveLength(1)
    expect(stderr).toContain('first fatal')
    expect(stderr).not.toContain('second fatal')
  })
})

async function runTeardownFixture(mode: string) {
  const proc = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'fixtures/shutdown-teardown.tsx'), mode],
    {
      cwd: repoRoot,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
      killSignal: 'SIGKILL',
    }
  )

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const report: unknown = JSON.parse(stdout.slice(stdout.indexOf('{')))

    return { exitCode, report, stderr }
  } finally {
    if (proc.exitCode === null) proc.kill('SIGKILL')
    await proc.exited
  }
}

describe('bounded teardown', () => {
  test('a failing renderer teardown step still destroys the renderer and unmounts the UI', async () => {
    const { exitCode, report, stderr } = await runTeardownFixture('renderer-step')

    expect(exitCode).toBe(0)
    expect(report).toMatchObject({ destroyed: true, lifecycle: ['mounted', 'unmounted'] })
    expect(stderr).toContain('could not fully restore the terminal')
    expect(stderr).not.toContain('fixture-teardown-secret')
  }, 10000)

  test('a failing terminal write still releases input, keeps the exit code, and exits', async () => {
    const { exitCode, report, stderr } = await runTeardownFixture('terminal-write')

    expect(exitCode).toBe(6)
    expect(report).toMatchObject({ destroyed: true, stdinPaused: true })
    expect(stderr).not.toContain('fixture-teardown-secret')
  }, 10000)

  test('a fatal error whose terminal reset fails still pauses input and prints the report', async () => {
    const { exitCode, report, stderr } = await runTeardownFixture('fatal-terminal-write')

    expect(exitCode).toBe(1)
    expect(report).toMatchObject({ destroyed: true, stdinPaused: true })
    expect(stderr).toContain('Fatal fatal error')
    expect(stderr).toContain('fixture fatal failure')
    expect(stderr).not.toContain('fixture-teardown-secret')
  }, 10000)
})

describe('terminal handoff', () => {
  async function runHandoff(mode: 'ok' | 'fail' | 'missing') {
    const proc = Bun.spawn(
      [process.execPath, join(import.meta.dir, 'fixtures/shutdown-handoff.tsx'), mode],
      {
        cwd: join(import.meta.dir, '..'),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 5000,
      }
    )

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    return { exitCode, lines: stdout.trim().split('\n'), stderr }
  }

  test('runs the attach command only after the UI is unmounted and the renderer destroyed', async () => {
    const { exitCode, lines } = await runHandoff('ok')

    expect(lines).toEqual(['unmounted listeners=0', 'handoff', 'exit code=0 destroyed=true'])
    expect(exitCode).toBe(0)
  })

  test('a failed attach exits nonzero and says the session was kept', async () => {
    const { exitCode, stderr } = await runHandoff('fail')

    expect(exitCode).toBe(3)
    expect(stderr).toContain("attach to tmux session 'fixture'")
    expect(stderr).toContain('still running')
  })

  test('an attach command that cannot start reports how to attach manually', async () => {
    const { exitCode, stderr } = await runHandoff('missing')

    expect(exitCode).toBe(1)
    expect(stderr).toContain('/mux-sesh-fixture/missing-attach')
    expect(stderr).toContain('still running')
  })
})
