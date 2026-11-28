import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'path'
import { testRender } from '@opentui/react/test-utils'
import { act, useState } from 'react'
import { AppRecoveryBoundary, useRecoveryTheme } from '../src/app'
import { createSimulatedCrash, SIMULATED_CRASH_MESSAGE } from '../src/app/dev-crash'
import { useLiveResolvedTheme } from '../src/app/resolved-theme'
import { resolveTheme, type ThemeResolver } from '../src/styles/theme'
import { FailurePalette } from '../src/ui/failure-screen'
import { cellsOf, sameColor, type Cell } from './fixtures/selection'

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

describe('simulated crash for development', () => {
  function CrashingApp({ useCrash }: { useCrash: () => void }) {
    useCrash()

    return <text>healthy app</text>
  }

  async function renderWith(useCrash: () => void) {
    setup = await testRender(
      <AppRecoveryBoundary>
        {retryKey => <CrashingApp key={retryKey} useCrash={useCrash} />}
      </AppRecoveryBoundary>,
      { width: 80, height: 24, consoleMode: 'disabled' }
    )
  }

  test('with dev mode and the crash flag, the app crashes once after it rendered', async () => {
    await renderWith(createSimulatedCrash({ MUX_SESH_DEV: '1', MUX_SESH_DEV_CRASH: '1' }))

    const failed = await frame()
    expect(failed).toContain('mux-sesh crashed')
    expect(failed).toContain(SIMULATED_CRASH_MESSAGE)

    const current = setup

    if (!current) throw new Error('Recovery fixture was not rendered')
    await act(async () => current.mockInput.pressKey('r'))

    expect(await frame()).toContain('healthy app')
  })

  test.each([
    ['without dev mode', { MUX_SESH_DEV_CRASH: '1' }],
    ['without the crash flag', { MUX_SESH_DEV: '1' }],
  ])('%s nothing crashes', async (_name, env) => {
    await renderWith(createSimulatedCrash(env))

    const shown = await frame()
    expect(shown).toContain('healthy app')
    expect(shown).not.toContain('mux-sesh crashed')
  })
})

describe('app recovery theme', () => {
  interface FailureTrigger {
    fail?: () => void
  }

  interface ThemedAppProps {
    trigger: FailureTrigger
    resolve?: ThemeResolver
  }

  function ThemedApp({ trigger, resolve = resolveTheme }: ThemedAppProps) {
    const [failing, setFailing] = useState(false)
    trigger.fail = () => setFailing(true)

    const { colors } = useLiveResolvedTheme(
      { themeId: 'github', customThemes: undefined, colorScheme: 'light', homeDir: '/fixture' },
      { resolve }
    )

    useRecoveryTheme(colors)

    if (failing) throw new Error('fixture themed app failure')

    return <text>healthy app</text>
  }

  async function topRow(): Promise<Cell[]> {
    if (!setup) throw new Error('Recovery fixture was not rendered')
    await frame()
    const row = setup.captureSpans().lines[0]

    if (!row) throw new Error('The error screen rendered no rows')

    return cellsOf(row)
  }

  function cell(row: Cell[], column: number): Cell {
    const found = row[column]

    if (!found) throw new Error(`Column ${column} was not rendered`)

    return found
  }

  test('a crash after the app rendered keeps the theme the user set', async () => {
    const trigger: FailureTrigger = {}
    const github = resolveTheme('github', {}, 'light').colors

    setup = await testRender(
      <AppRecoveryBoundary>{() => <ThemedApp trigger={trigger} />}</AppRecoveryBoundary>,
      {
        width: 80,
        height: 24,
        consoleMode: 'disabled',
      }
    )

    expect(await frame()).toContain('healthy app')
    await act(async () => trigger.fail?.())

    expect(await frame()).toContain('mux-sesh crashed')
    const top = await topRow()
    expect(sameColor(cell(top, 0).fg, github.border)).toBe(true)
    expect(sameColor(cell(top, 3).fg, github.danger)).toBe(true)
    expect(sameColor(cell(top, 0).bg, github.background)).toBe(true)
  })

  test('a crash thrown from theme resolution falls back to the built-in colors', async () => {
    const fallback = FailurePalette.fallback

    const resolve: ThemeResolver = () => {
      throw new Error('fixture theme resolution failure')
    }

    setup = await testRender(
      <AppRecoveryBoundary>
        {() => <ThemedApp trigger={{}} resolve={resolve} />}
      </AppRecoveryBoundary>,
      { width: 80, height: 24, consoleMode: 'disabled' }
    )

    const failed = await frame()
    expect(failed).toContain('mux-sesh crashed')
    expect(failed).toContain('fixture theme resolution failure')
    const top = await topRow()
    expect(sameColor(cell(top, 0).fg, fallback.border)).toBe(true)
    expect(sameColor(cell(top, 3).fg, fallback.danger)).toBe(true)
    expect(sameColor(cell(top, 0).bg, fallback.background)).toBe(true)
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
