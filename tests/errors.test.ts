import { describe, expect, test } from 'bun:test'
import {
  MAX_ISSUE_URL_LENGTH,
  buildIssueUrl,
  describeFailure,
  formatDiagnostics,
  redactDiagnosticText,
} from '../src/util/errors'

const context = {
  muxSeshVersion: '1.2.3',
  bunVersion: '1.3.14',
  os: 'linux 6.0',
  architecture: 'x64',
  terminal: 'ghostty 1.0',
  backend: 'herdr',
}

describe('crash diagnostics', () => {
  test('preserves Error message and stack with deterministic environment context', () => {
    const error = new Error('rename failed')
    error.stack = 'Error: rename failed\n    at rename (/app/rename.ts:1:2)'

    const report = formatDiagnostics(error, context)

    expect(report).toContain('Message:\nrename failed')
    expect(report).toContain('Stack:\nError: rename failed')
    expect(report).toContain('mux-sesh: 1.2.3')
    expect(report).toContain('Terminal: ghostty 1.0')
    expect(report).toContain('Backend: herdr')
  })

  test('formats non-Error failures and unserializable values', () => {
    expect(describeFailure({ code: 42, reason: 'bad response' }).message).toContain('bad response')

    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(describeFailure(circular).message).toContain('unserializable')
  })

  test('redacts cwd and home boundaries without including unrelated environment secrets', () => {
    const original = process.env.MUX_SESH_TEST_SECRET
    process.env.MUX_SESH_TEST_SECRET = 'do-not-report-this'
    try {
      const input = `${process.cwd()}/src/index.tsx ${process.env.HOME}/private`
      const redacted = redactDiagnosticText(input)
      const error = new Error(input)
      const report = formatDiagnostics(error, context)
      const issue = buildIssueUrl(error, report).toString()

      expect(redacted).toContain('<cwd>/src/index.tsx')
      expect(redacted).toContain('~/private')
      expect(report).not.toContain('do-not-report-this')
      expect(decodeURIComponent(issue)).not.toContain(process.cwd())
      if (process.env.HOME) expect(decodeURIComponent(issue)).not.toContain(process.env.HOME)
    } finally {
      if (original === undefined) delete process.env.MUX_SESH_TEST_SECRET
      else process.env.MUX_SESH_TEST_SECRET = original
    }
  })

  test('bounds encoded GitHub issue URLs and marks truncated diagnostics', () => {
    const error = new Error('large trace')
    const diagnostics =
      formatDiagnostics(error, context) + `\n${'🔥 path with spaces & symbols '.repeat(2000)}`
    const url = buildIssueUrl(error, diagnostics)

    expect(url.toString().length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH)
    expect(url.hostname).toBe('github.com')
    expect(url.pathname).toBe('/quiet-ghost/mux-sesh/issues/new')
    expect(url.searchParams.get('body')).toContain('diagnostics truncated')
  })
})
