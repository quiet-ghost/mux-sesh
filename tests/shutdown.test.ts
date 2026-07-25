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

  test('ignores duplicate fatal events', async () => {
    const shutdownModule = pathToFileURL(join(repoRoot, 'src/util/shutdown.ts')).href
    const script = `
      import { requestFatalShutdown } from ${JSON.stringify(shutdownModule)}
      const originalExit = process.exit
      let exits = 0
      process.exit = (() => { exits += 1 }) as typeof process.exit
      requestFatalShutdown(new Error('first fatal'), 'test event')
      requestFatalShutdown(new Error('second fatal'), 'test event')
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
    expect(stderr.match(/Fatal test event:/g)).toHaveLength(1)
    expect(stderr).toContain('first fatal')
    expect(stderr).not.toContain('second fatal')
  })
})
