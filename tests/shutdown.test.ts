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
})
