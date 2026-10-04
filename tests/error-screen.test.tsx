import { afterEach, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'
import { ErrorScreen } from '../src/ui/ErrorScreen'
import { DiagnosticReport } from '../src/util/errors'

let setup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  const current = setup
  setup = undefined
  if (!current) return
  act(() => current.renderer.destroy())
  expect(current.renderer.isDestroyed).toBe(true)
  expect(current.renderer.stdin.listenerCount('data')).toBe(0)
})

test('headline, clipboard, and browser use the same captured safe report', async () => {
  const error = new Error('launch failed: token=fixture-screen-secret')
  error.stack = 'at launch https://user:fixture-url-secret@example.test/private'
  const report = DiagnosticReport.capture(error, { backend: 'unknown' })
  error.message = 'fixture-mutated-message'
  error.stack = 'fixture-mutated-stack'
  const copied: string[] = []
  const opened: string[] = []
  let retries = 0
  setup = await testRender(
    <ErrorScreen
      report={report}
      onRetry={() => {
        retries++
      }}
      actions={{
        copy: text => {
          copied.push(text)
          return true
        },
        open: async url => {
          opened.push(url)
          return true
        },
      }}
    />,
    { width: 120, height: 36, consoleMode: 'disabled' }
  )
  const current = setup
  await current.renderOnce()
  const frame = current.captureCharFrame()
  expect(frame).toContain(report.summary)
  expect(frame).toContain('Backend: unknown')
  expect(frame).not.toContain('fixture-screen-secret')
  expect(frame).not.toContain('fixture-url-secret')
  expect(frame).not.toContain('fixture-mutated')

  await act(async () => current.mockInput.pressKey('c'))
  await act(async () => current.mockInput.pressKey('o'))
  await act(async () => current.mockInput.pressKey('r'))
  expect(copied).toEqual([report.text])
  expect(opened).toEqual([report.issueUrl])
  expect(new URL(opened[0]).searchParams.get('body')).toContain(report.text)
  expect(retries).toBe(1)
})

test.each([
  { width: 60, height: 18 },
  { width: 80, height: 24 },
  { width: 120, height: 36 },
])('a shortened report stays visible and copyable at $width x $height', async dimensions => {
  const error = new Error('large trace')
  error.stack = '🔥 trace '.repeat(2000)
  const report = DiagnosticReport.capture(error)
  const copied: string[] = []
  expect(report.issueUrlTruncated).toBe(true)
  setup = await testRender(
    <ErrorScreen
      report={report}
      onRetry={() => {}}
      actions={{
        copy: text => {
          copied.push(text)
          return true
        },
        open: async () => false,
      }}
    />,
    { ...dimensions, consoleMode: 'disabled' }
  )
  const current = setup
  await current.renderOnce()
  expect(current.captureCharFrame()).toContain('Browser report shortened')
  await act(async () => current.mockInput.pressKey('c'))
  expect(copied).toEqual([report.text])
  await current.renderOnce()
  expect(current.captureCharFrame()).toContain('shares diagnostics')
})
