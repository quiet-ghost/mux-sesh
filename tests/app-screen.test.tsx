import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'path'
import { TextareaRenderable } from '@opentui/core'
import { renderSessionScreen } from './fixtures/session-screen'

let screen: Awaited<ReturnType<typeof renderSessionScreen>> | undefined

afterEach(() => {
  const fixture = screen
  screen = undefined
  if (!fixture) return
  fixture.destroy()
  expect(fixture.renderer.isDestroyed).toBe(true)
  expect(fixture.lifecycle).toEqual(['mounted', 'unmounted'])
  expect(fixture.renderer.stdin.listenerCount('data')).toBe(0)
})

describe('production session screen', () => {
  test.each([
    { width: 60, height: 18 },
    { width: 80, height: 24 },
    { width: 120, height: 36 },
  ])('moves the selected row at $width x $height', async dimensions => {
    screen = await renderSessionScreen(dimensions)

    expect(await screen.frame()).toMatch(/› .*alpha/)
    expect(screen.captureSpans()).toMatchObject({ cols: dimensions.width, rows: dimensions.height })

    await screen.pressKey('ARROW_DOWN')

    const frame = await screen.frame()
    expect(frame).toMatch(/› .*beta/)
    expect(frame).not.toMatch(/› .*alpha/)
    if (dimensions.width >= 80) {
      expect(screen.calls).toContainEqual({ operation: 'details', id: 'w2' })
    } else {
      expect(screen.calls).toEqual([{ operation: 'list' }])
    }
  })

  test('keeps the selected row through terminal resize', async () => {
    screen = await renderSessionScreen({ width: 120, height: 36 })
    await screen.pressKey('ARROW_DOWN')

    await screen.resize(60, 18)

    expect(await screen.frame()).toMatch(/› .*beta/)
    expect(screen.captureSpans()).toMatchObject({ cols: 60, rows: 18 })
    expect(await screen.frame()).toContain('Resize for the detail pane.')

    await screen.resize(80, 24)

    expect(await screen.frame()).toMatch(/› .*beta/)
    expect(screen.captureSpans()).toMatchObject({ cols: 80, rows: 24 })
    expect(await screen.frame()).not.toContain('Resize for the detail pane.')
  })

  test('focuses the real search input and filters rendered rows', async () => {
    screen = await renderSessionScreen({ width: 60, height: 18 })
    expect(screen.renderer.currentFocusedRenderable?.id ?? null).toBeNull()

    await screen.pressKey('i')

    const input = screen.renderer.currentFocusedRenderable
    if (!(input instanceof TextareaRenderable)) {
      throw new Error('Search mode did not focus its textarea')
    }
    expect(input.focused).toBe(true)

    await screen.typeText('beta')

    const frame = await screen.frame()
    expect(input.plainText).toBe('beta')
    expect(frame).toMatch(/› .*beta/)
    expect(frame).not.toContain('alpha')

    await screen.pressKey('ESCAPE')

    expect(screen.renderer.currentFocusedRenderable?.id ?? null).toBeNull()
    expect(await screen.frame()).toContain('alpha')
  })

  test.each([
    { key: 'q', opened: [] },
    { key: 'RETURN', opened: ['w2'] },
  ])(
    'exits after $key with renderer and effects released',
    async ({ key, opened }) => {
      const proc = Bun.spawn(
        [process.execPath, join(import.meta.dir, 'fixtures/session-screen-exit.ts'), key],
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

        expect(stderr).toBe('')
        expect(exitCode).toBe(0)
        const report: unknown = JSON.parse(stdout)
        expect(report).toEqual({
          exitCode: 0,
          selectedBeta: true,
          rendererDestroyed: true,
          inputListeners: 0,
          lifecycle: ['mounted', 'unmounted'],
          opened,
        })
      } finally {
        if (proc.exitCode === null) proc.kill('SIGKILL')
        await proc.exited
      }
    },
    10000
  )
})
