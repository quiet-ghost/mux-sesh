import { describe, expect, test } from 'bun:test'
import { DiagnosticReport, MAX_DIAGNOSTIC_LENGTH, MAX_ISSUE_URL_LENGTH } from '../src/util/errors'

const context = {
  muxSeshVersion: '1.2.3',
  bunVersion: '1.3.14',
  os: 'linux 6.0',
  architecture: 'x64',
  terminal: 'ghostty 1.0',
  backend: 'herdr',
}

describe('crash diagnostics', () => {
  test('removes credentials and sensitive URLs from message and stack', () => {
    const error = new Error('launch failed: token=fixture-message-secret')
    error.stack =
      'Error: password=fixture-stack-secret\n    at https://user:fixture-url-secret@example.test/private?key=fixture-query-secret#fixture-fragment'
    const report = DiagnosticReport.capture(error, context)
    const issue = new URL(report.issueUrl)

    for (const secret of [
      'fixture-message-secret',
      'fixture-stack-secret',
      'fixture-url-secret',
      'fixture-query-secret',
      'fixture-fragment',
    ]) {
      expect(report.summary).not.toContain(secret)
      expect(report.text).not.toContain(secret)
      expect(issue.searchParams.get('title')).not.toContain(secret)
      expect(issue.searchParams.get('body')).not.toContain(secret)
    }
  })

  test('preserves Error message and stack with deterministic environment context', () => {
    const error = new Error('rename failed')
    error.stack = 'Error: rename failed\n    at rename (/app/rename.ts:1:2)'

    const report = DiagnosticReport.capture(error, context)

    expect(report.summary).toBe('rename failed')
    expect(report.text).toContain('Message:\nrename failed')
    expect(report.text).toContain('Stack:\nError: rename failed')
    expect(report.text).toContain('mux-sesh: 1.2.3')
    expect(report.text).toContain('Terminal: ghostty 1.0')
    expect(report.text).toContain('Backend: herdr')
  })

  test('omits arbitrary object fields and circular values', () => {
    const report = DiagnosticReport.capture({ code: 42, reason: 'fixture-private-reason' }, context)
    expect(report.summary).toContain('details omitted')
    expect(report.text).not.toContain('fixture-private-reason')

    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(DiagnosticReport.capture(circular, context).summary).toContain('details omitted')
  })

  test('does not invoke object hooks, proxy traps, or Error accessors', () => {
    let reads = 0
    const hostile = () => {
      reads++
      throw new Error('fixture-getter-secret')
    }
    const object = {
      toJSON: hostile,
      toString: hostile,
      get message() {
        return hostile()
      },
    }
    const proxy = new Proxy(new Error('fixture-proxy-secret'), {
      get: hostile,
      getPrototypeOf: hostile,
      getOwnPropertyDescriptor: hostile,
    })
    const error = new Error('initial-safe')
    for (const key of ['message', 'name', 'stack', 'cause']) {
      Object.defineProperty(error, key, { get: hostile })
    }
    const lazyMessage = new Error('initial-safe')
    Object.defineProperty(lazyMessage, 'message', { get: hostile })
    for (const value of [object, proxy, error, lazyMessage]) {
      const report = DiagnosticReport.capture(value, {
        ...context,
        get terminal() {
          return hostile()
        },
      })
      expect(report.text).toContain('mux-sesh: 1.2.3')
      expect(report.text).not.toContain('fixture-getter-secret')
      expect(report.text).not.toContain('fixture-proxy-secret')
    }
    expect(reads).toBe(0)
  })

  test('sanitizes causes, detects cycles, and bounds cause depth', () => {
    const cause = new Error('request failed: password=fixture-cause-secret')
    cause.stack = 'at request (C:\\Users\\fixture-user\\private project\\credentials.ts:1:2)'
    const error = new Error('launch failed', { cause })
    error.stack = 'at launch'
    cause.cause = error

    const report = DiagnosticReport.capture(error, context)
    expect(report.text).toContain('Cause 1:')
    expect(report.text).toContain('Cause cycle omitted')
    expect(report.text).not.toContain('fixture-cause-secret')
    expect(report.text).not.toContain('fixture-user')
    expect(report.text).not.toContain('private project')
    expect(report.truncated).toBe(true)

    let deep = new Error('level 8')
    deep.stack = ''
    for (let level = 7; level >= 0; level--) {
      deep = new Error(`level ${level}`, { cause: deep })
      deep.stack = ''
    }
    const bounded = DiagnosticReport.capture(deep, context)
    expect(bounded.text).toContain('level 3')
    expect(bounded.text).not.toContain('level 4')
    expect(bounded.truncated).toBe(true)
  })

  test.each([
    ['password="fixture with spaces, semicolons; and \\"quotes\\""', 'fixture with spaces'],
    ['apiKey: fixture-api-secret', 'fixture-api-secret'],
    ['pwd=fixture-password-alias', 'fixture-password-alias'],
    ['AWS_SECRET_ACCESS_KEY=fixture-access-secret', 'fixture-access-secret'],
    ['Authorization: Bearer fixture-auth-secret', 'fixture-auth-secret'],
    ['Basic Zml4dHVyZS1vbmx5', 'Zml4dHVyZS1vbmx5'],
    ['Cookie: first=fixture-cookie-one; second=fixture-cookie-two', 'fixture-cookie-two'],
    ['Set-Cookie: sid=fixture-cookie-secret; HttpOnly', 'fixture-cookie-secret'],
    ['password=fixture-first&fixture-second', 'fixture-second'],
    ['ghp_' + 'fixture-provider-secret', 'fixture-provider-secret'],
    ['sk-proj-' + 'fixture-model-secret', 'fixture-model-secret'],
    ['eyJfixture.eyJpayload.fixture-signature', 'fixture-signature'],
    [
      'https%3A%2F%2Fuser%3Afixture-encoded-secret%40example.test%2Fprivate',
      'fixture-encoded-secret',
    ],
    ['data:text/plain,fixture-data-content', 'fixture-data-content'],
    ['mailto:fixture-private@example.test', 'fixture-private@example.test'],
    [JSON.stringify({ password: 'before "quoted" fixture-after-quote' }), 'fixture-after-quote'],
    [
      '-----BEGIN PRIVATE KEY-----\nfixture-key-material\n-----END PRIVATE KEY-----',
      'fixture-key-material',
    ],
    ['pa\u001b[31mss\u202eword=fixture-control-secret', 'fixture-control-secret'],
    ['reading /home/fixture-user/private project/customer.csv', 'customer.csv'],
    ['reading \\\\fixture-server\\private share\\customer.csv', 'fixture-server'],
  ])('redacts sensitive text: %s', (input, secret) => {
    const report = DiagnosticReport.capture(input, context)
    const url = new URL(report.issueUrl)
    for (const output of [
      report.summary,
      report.text,
      url.searchParams.get('title'),
      url.searchParams.get('body'),
    ]) {
      expect(output).not.toContain(secret)
    }
  })

  test('removes terminal controls and neutralizes Markdown across report outputs', () => {
    const input = [
      'failure',
      '\u001b]52;c;fixture-osc-payload\u0007',
      '\u001b]8;;https://fixture-link.test\u001b\\label\u001b]8;;\u001b\\',
      '\u001bPfixture-dcs-payload\u001b\\',
      '\u009b31mred\u001b[0m',
      '```\n# forged section\n![image](https://fixture-markdown.test)',
      '<script>fixture</script> ~~~ **emphasis** &#96;',
      '\u001b]52;c;fixture-unterminated-osc',
    ].join('\n')
    const report = DiagnosticReport.capture(input, context)
    const url = new URL(report.issueUrl)

    for (const output of [report.summary, report.text]) {
      expect(output).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/)
      expect(output).not.toMatch(/[`~<>&\[\]*#]/)
      expect(output).not.toContain('fixture-osc-payload')
      expect(output).not.toContain('fixture-dcs-payload')
      expect(output).not.toContain('fixture-unterminated-osc')
      expect(output).not.toContain('fixture-link.test')
    }
    expect(url.searchParams.get('body')?.match(/```/g)).toHaveLength(2)
    expect(url.searchParams.get('body')).toContain(report.text)
  })

  test('captures an immutable snapshot before the original error or context changes', () => {
    const error = new Error('initial failure')
    error.stack = 'at initial'
    const metadata = { ...context }
    const report = DiagnosticReport.capture(error, metadata)
    const original = { ...report }

    error.message = 'token=fixture-later-secret'
    error.stack = 'fixture-later-stack'
    metadata.terminal = 'fixture-later-terminal'

    expect(Object.isFrozen(report)).toBe(true)
    expect(report).toEqual(original)
    expect(report.text).toContain('initial failure')
    expect(report.text).not.toContain('fixture-later')
    expect(new URL(report.issueUrl).searchParams.get('body')).toContain(report.text)
  })

  test('bounds huge input before capture and keeps malformed Unicode printable', () => {
    const report = DiagnosticReport.capture('🔥'.repeat(50000) + '\ud800', context)
    expect(report.summary.length).toBeLessThanOrEqual(240)
    expect(report.text.length).toBeLessThanOrEqual(MAX_DIAGNOSTIC_LENGTH)
    expect(report.issueUrl.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH)
    expect(report.truncated).toBe(true)
    expect(report.text.isWellFormed()).toBe(true)
    expect(DiagnosticReport.capture('failure\ud800', context).text.isWellFormed()).toBe(true)
  })

  test('retains allowlisted context when large traces exhaust the report budget', () => {
    let error = new Error('deep failure')
    error.stack = 'trace '.repeat(2000)
    for (let index = 0; index < 3; index++) {
      error = new Error('outer failure', { cause: error })
      error.stack = 'trace '.repeat(2000)
    }

    const report = DiagnosticReport.capture(error, context)
    expect(report.truncated).toBe(true)
    expect(report.text.length).toBeLessThanOrEqual(MAX_DIAGNOSTIC_LENGTH)
    expect(report.text).toContain('mux-sesh: 1.2.3')
    expect(report.text).toContain('Backend: herdr')
    expect(new URL(report.issueUrl).searchParams.get('body')).toContain('mux-sesh: 1.2.3')
  })

  test('redacts cwd and home boundaries without including unrelated environment secrets', () => {
    const original = process.env.MUX_SESH_TEST_SECRET
    process.env.MUX_SESH_TEST_SECRET = 'do-not-report-this'
    try {
      const input = `${process.cwd()}/src/index.tsx ${process.env.HOME}/private`
      const error = new Error(input)
      const report = DiagnosticReport.capture(error, context)
      const issue = report.issueUrl

      expect(report.text).toContain('‹app›/src/index.tsx')
      expect(report.text).toContain('‹path redacted›')
      expect(report.text).not.toContain('do-not-report-this')
      expect(decodeURIComponent(issue)).not.toContain(process.cwd())
      if (process.env.HOME) expect(decodeURIComponent(issue)).not.toContain(process.env.HOME)
    } finally {
      if (original === undefined) delete process.env.MUX_SESH_TEST_SECRET
      else process.env.MUX_SESH_TEST_SECRET = original
    }
  })

  test('bounds encoded GitHub issue URLs and marks truncated diagnostics', () => {
    const error = new Error('large trace')
    error.stack = '🔥 path with spaces & symbols '.repeat(2000)
    const report = DiagnosticReport.capture(error, context)
    const url = new URL(report.issueUrl)

    expect(report.text.length).toBeLessThanOrEqual(MAX_DIAGNOSTIC_LENGTH)
    expect(report.truncated).toBe(true)
    expect(report.issueUrlTruncated).toBe(true)
    expect(url.toString().length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH)
    expect(url.hostname).toBe('github.com')
    expect(url.pathname).toBe('/quiet-ghost/mux-sesh/issues/new')
    expect(url.searchParams.get('body')).toContain('diagnostics truncated')
  })
})
