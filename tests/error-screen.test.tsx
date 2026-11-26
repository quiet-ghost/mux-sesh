import { afterEach, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'
import { ErrorScreen } from '../src/ui/ErrorScreen'
import type { ClipboardResult } from '../src/util/clipboard'
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

interface Fixture {
  copied: string[]
  opened: string[]
  quits: number
}

type OpenFixture = (url: string) => Promise<boolean>

async function renderScreen(
  report: DiagnosticReport,
  copyResult: ClipboardResult,
  open: OpenFixture = async () => true,
  dimensions = { width: 80, height: 24 }
) {
  const fixture: Fixture = { copied: [], opened: [], quits: 0 }
  setup = await testRender(
    <ErrorScreen
      report={report}
      onRetry={() => {}}
      onQuit={() => {
        fixture.quits++
      }}
      actions={{
        copy: text => {
          fixture.copied.push(text)

          return copyResult
        },
        open: async url => {
          fixture.opened.push(url)

          return open(url)
        },
      }}
    />,
    { ...dimensions, consoleMode: 'disabled' }
  )

  return { current: setup, fixture }
}

type Screen = Awaited<ReturnType<typeof renderScreen>>['current']

// A bare ESC is only emitted after OpenTUI's 20ms escape-sequence ambiguity timeout.
async function pressBareEscape(current: Screen): Promise<void> {
  await act(async () => {
    current.mockInput.pressEscape()
    await Bun.sleep(50)
  })
}

async function shownText(current: Screen): Promise<string> {
  await current.renderOnce()

  return current.captureCharFrame().replace(/\s+/g, ' ')
}

function largeReport(): DiagnosticReport {
  const error = new Error('large trace')
  error.stack = '🔥 trace '.repeat(2000)

  return DiagnosticReport.capture(error)
}

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
      onQuit={() => {}}
      actions={{
        copy: text => {
          copied.push(text)

          return { kind: 'copied' }
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
  expect(opened).toEqual([])
  await act(async () => current.mockInput.pressKey('y'))
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
  const report = largeReport()
  expect(report.issueUrlTruncated).toBe(true)

  const { current, fixture } = await renderScreen(
    report,
    { kind: 'copied' },
    async () => false,
    dimensions
  )

  await current.renderOnce()
  expect(current.captureCharFrame()).toContain('Browser report shortened')
  await act(async () => current.mockInput.pressKey('c'))
  expect(fixture.copied).toEqual([report.text])
  await current.renderOnce()
  expect(current.captureCharFrame()).toContain('shares diagnostics')
})

test.each([
  { width: 60, height: 18 },
  { width: 80, height: 24 },
  { width: 120, height: 36 },
])('the share confirmation fits at $width x $height', async dimensions => {
  const { current } = await renderScreen(largeReport(), { kind: 'copied' }, undefined, dimensions)
  await act(async () => current.mockInput.pressKey('o'))
  const frame = await shownText(current)

  expect(frame).toContain('github.com')
  expect(frame).toContain('The browser copy is shortened to fit the URL.')
  expect(frame).toContain('y/enter open')
  expect(frame).toContain('n/esc cancel')
})

test('o asks before opening and only an explicit confirm opens the issue once', async () => {
  const report = DiagnosticReport.capture(new Error('launch failed'))
  expect(report.issueUrlTruncated).toBe(false)
  const { current, fixture } = await renderScreen(report, { kind: 'copied' })
  await act(async () => current.mockInput.pressKey('o'))
  const confirmation = await shownText(current)

  expect(fixture.opened).toEqual([])
  expect(confirmation).toContain('github.com')
  expect(confirmation).toContain('browser')
  expect(confirmation).toContain('full report')
  expect(confirmation).not.toContain('shortened')

  await act(async () => current.mockInput.pressEnter())
  await act(async () => current.mockInput.pressKey('y'))
  await current.renderOnce()

  expect(fixture.opened).toEqual([report.issueUrl])
  expect(fixture.copied).toEqual([])
  expect(current.captureCharFrame()).toContain('Sent the prefilled issue to your browser')
})

test('n and escape cancel the confirmation without opening or quitting', async () => {
  const report = DiagnosticReport.capture(new Error('launch failed'))
  const { current, fixture } = await renderScreen(report, { kind: 'copied' })

  await act(async () => current.mockInput.pressKey('o'))
  await pressBareEscape(current)
  expect(await shownText(current)).toContain('Sharing cancelled; nothing was sent')

  await act(async () => current.mockInput.pressKey('o'))
  await act(async () => current.mockInput.pressKey('n'))
  await act(async () => current.mockInput.pressKey('y'))
  await act(async () => current.mockInput.pressEnter())
  const frame = await shownText(current)

  expect(fixture.opened).toEqual([])
  expect(fixture.copied).toEqual([])
  expect(fixture.quits).toBe(0)
  expect(frame).toContain('mux-sesh crashed')
  expect(frame).toContain('Sharing cancelled; nothing was sent')
})

test('q quits from the confirmation and escape quits outside it', async () => {
  const report = DiagnosticReport.capture(new Error('launch failed'))
  const { current, fixture } = await renderScreen(report, { kind: 'copied' })

  await act(async () => current.mockInput.pressKey('o'))
  await act(async () => current.mockInput.pressKey('q'))
  expect(fixture.quits).toBe(1)

  await act(async () => current.mockInput.pressKey('n'))
  await pressBareEscape(current)
  expect(fixture.quits).toBe(2)
  expect(fixture.opened).toEqual([])
})

test.each([
  { result: { kind: 'copied' } as const, message: 'Diagnostics copied to the clipboard' },
  {
    result: { kind: 'sent-unconfirmed' } as const,
    message: 'Diagnostics sent to the terminal clipboard; the terminal may not support it',
  },
  { result: { kind: 'unavailable' } as const, message: 'Clipboard unavailable' },
])('copy reports $result.kind truthfully', async ({ result, message }) => {
  const report = DiagnosticReport.capture(new Error('launch failed'))
  const { current, fixture } = await renderScreen(report, result)
  await act(async () => current.mockInput.pressKey('c'))
  const frame = await shownText(current)

  expect(fixture.copied).toEqual([report.text])
  expect(frame).toContain(message)

  if (result.kind !== 'copied') expect(frame).not.toContain('copied')
})

test('a failed browser launch copies the report URL instead of crashing', async () => {
  const report = DiagnosticReport.capture(new Error('launch failed'))

  const { current, fixture } = await renderScreen(report, { kind: 'copied' }, async () => {
    throw new Error('xdg-open unavailable')
  })

  await act(async () => current.mockInput.pressKey('o'))
  await act(async () => current.mockInput.pressKey('y'))
  await current.renderOnce()

  expect(current.captureCharFrame()).toContain('Could not open the browser; issue URL copied')
  expect(fixture.copied).toEqual([report.issueUrl])
})

test('a failed browser launch with an unconfirmed URL copy says so', async () => {
  const report = DiagnosticReport.capture(new Error('launch failed'))

  const { current, fixture } = await renderScreen(
    report,
    { kind: 'sent-unconfirmed' },
    async () => false
  )

  await act(async () => current.mockInput.pressKey('o'))
  await act(async () => current.mockInput.pressKey('y'))
  const frame = await shownText(current)

  expect(fixture.copied).toEqual([report.issueUrl])
  expect(frame).toContain('Could not open the browser')
  expect(frame).toContain('issue URL sent to the terminal clipboard; the terminal may not')
  expect(frame).not.toContain('URL copied')
})

test('a failed browser launch without a clipboard points to c for the full report', async () => {
  const report = largeReport()
  const { current } = await renderScreen(report, { kind: 'unavailable' }, async () => false)
  await act(async () => current.mockInput.pressKey('o'))
  await act(async () => current.mockInput.pressKey('y'))
  const frame = await shownText(current)

  expect(frame).toContain('Could not open the browser')
  expect(frame).toContain('c copies the full local report')
  expect(frame).not.toContain('URL copied')
})

test('a failed shortened launch notes that c keeps the full local report at 60 x 18', async () => {
  const report = largeReport()

  const { current } = await renderScreen(report, { kind: 'sent-unconfirmed' }, async () => false, {
    width: 60,
    height: 18,
  })

  await act(async () => current.mockInput.pressKey('o'))
  await act(async () => current.mockInput.pressKey('y'))
  const frame = await shownText(current)

  expect(frame).toContain('the terminal may not support it.')
  expect(frame).toContain('Its report is shortened; c copies the full local report.')
})
