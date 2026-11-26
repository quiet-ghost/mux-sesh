import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'path'
import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'
import { AppRecoveryBoundary } from '../src/app'

let setup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  const current = setup
  setup = undefined

  if (!current) return
  act(() => current.renderer.destroy())
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick++) await Bun.sleep(0)
  })
}

async function frame(): Promise<string> {
  if (!setup) throw new Error('Recovery fixture was not rendered')
  const current = setup
  await act(async () => current.renderOnce())
  await settle()
  await act(async () => current.renderOnce())

  return current.captureCharFrame()
}

describe('app recovery', () => {
  test('a renderer pass failure reaches the error screen and retry remounts the app', async () => {
    let failures = 1

    const renderBefore = () => {
      if (failures > 0) {
        failures--
        throw new Error('fixture render failure')
      }
    }

    setup = await testRender(
      <AppRecoveryBoundary>
        {retryKey => (
          <box key={retryKey} renderBefore={renderBefore}>
            <text>healthy app</text>
          </box>
        )}
      </AppRecoveryBoundary>,
      { width: 80, height: 24, consoleMode: 'disabled' }
    )

    const failed = await frame()
    expect(failed).toContain('mux-sesh crashed')
    expect(failed).toContain('fixture render failure')
    expect(failed).not.toContain('healthy app')

    const current = setup
    await act(async () => current.mockInput.pressKey('r'))

    expect(await frame()).toContain('healthy app')
  })

  test('a mouse handler failure reaches the error screen instead of the console', async () => {
    setup = await testRender(
      <AppRecoveryBoundary>
        {() => (
          <box
            width={20}
            height={3}
            onMouseDown={() => {
              throw new Error('fixture mouse failure')
            }}
          >
            <text>click me</text>
          </box>
        )}
      </AppRecoveryBoundary>,
      { width: 80, height: 24, consoleMode: 'disabled', useMouse: true }
    )

    expect(await frame()).toContain('click me')
    const current = setup
    await act(async () => current.mockMouse.click(2, 1))

    const failed = await frame()
    expect(failed).toContain('mux-sesh crashed')
    expect(failed).toContain('fixture mouse failure')
  })
})

describe('app recovery escalation', () => {
  async function runRenderFailure(mode: 'repeat' | 'error-view') {
    const proc = Bun.spawn(
      [process.execPath, join(import.meta.dir, 'fixtures/render-failure.tsx'), mode],
      {
        cwd: join(import.meta.dir, '..'),
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

      return { exitCode, stdout, stderr }
    } finally {
      if (proc.exitCode === null) proc.kill('SIGKILL')
      await proc.exited
    }
  }

  test('a failure that persists on the error screen restores the terminal and exits', async () => {
    const { exitCode, stdout, stderr } = await runRenderFailure('repeat')

    expect(exitCode).toBe(1)
    expect(stdout).toContain('destroyed=true')
    expect(stderr).toContain('Fatal fatal error')
    expect(stderr).toContain('fixture persistent render failure')
    expect(stderr).not.toContain('fixture-render-secret')
  }, 10000)

  test('an error screen that cannot render exits with a sanitized report instead of a raw trace', async () => {
    const { exitCode, stdout, stderr } = await runRenderFailure('error-view')

    expect(exitCode).toBe(1)
    expect(stdout).toContain('destroyed=true')
    // React's development log of the caught error goes to this fixture's uncaptured console; the
    // app's own output is the fatal report, which must stay sanitized.
    const fatal = stderr.slice(stderr.indexOf('Fatal fatal error'))
    expect(fatal).toContain('Fatal fatal error')
    expect(fatal).toContain('fixture error view failure')
    expect(fatal).not.toContain('fixture-render-secret')
  }, 10000)
})
