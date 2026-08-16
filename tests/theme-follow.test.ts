import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { subscribeThemeFollow } from '../src/styles/theme-follow'

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

describe('subscribeThemeFollow', () => {
  test('debounces watch and SIGUSR2 into one refresh', async () => {
    const watchers: Array<() => void> = []
    const signals: Array<() => void> = []
    let refreshCount = 0

    const subscription = subscribeThemeFollow(
      '/tmp/fake-home',
      { onRefresh: () => {
        refreshCount += 1
      } },
      {
        debounceMs: 15,
        watch: (_path, listener) => {
          watchers.push(listener)
          return { close: () => {} }
        },
        onSignal: (_signal, listener) => {
          signals.push(listener)
          return () => {}
        },
      }
    )

    expect(watchers).toHaveLength(1)
    expect(signals).toHaveLength(1)

    watchers[0]?.()
    signals[0]?.()

    expect(refreshCount).toBe(0)
    await Bun.sleep(30)
    expect(refreshCount).toBe(1)

    subscription.stop()
  })

  test('stop prevents further refreshes', async () => {
    const watchers: Array<() => void> = []
    let refreshCount = 0
    let closed = false
    let unsubscribed = false

    const subscription = subscribeThemeFollow(
      '/tmp/fake-home',
      { onRefresh: () => {
        refreshCount += 1
      } },
      {
        debounceMs: 10,
        watch: (_path, listener) => {
          watchers.push(listener)
          return {
            close: () => {
              closed = true
            },
          }
        },
        onSignal: (_signal, _listener) => () => {
          unsubscribed = true
        },
      }
    )

    subscription.stop()
    expect(closed).toBe(true)
    expect(unsubscribed).toBe(true)

    watchers[0]?.()
    await Bun.sleep(20)
    expect(refreshCount).toBe(0)
  })

  test('SIGUSR2 does not shut the process down', async () => {
    const followModule = pathToFileURL(join(repoRoot, 'src/styles/theme-follow.ts')).href
    const script = `
      import { ignoreUnhandledThemeFollowSignal } from ${JSON.stringify(followModule)}
      ignoreUnhandledThemeFollowSignal()
      setInterval(() => {}, 5000)
      process.kill(process.pid, 'SIGUSR2')
      setTimeout(() => process.exit(0), 80)
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

    expect(exitCode).toBe(0)
  })
})
