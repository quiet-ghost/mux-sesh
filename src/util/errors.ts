import { arch, platform, release } from 'os'
import { types } from 'util'
import { CURRENT_VERSION } from '../update/version'
import { MAX_DIAGNOSTIC_INPUT_LENGTH, sanitizeDiagnosticText } from './diagnostic-text'

const ISSUE_URL = 'https://github.com/quiet-ghost/mux-sesh/issues/new'
export const MAX_ISSUE_URL_LENGTH = 6000
export const MAX_DIAGNOSTIC_LENGTH = 12_000
const REPORT_TRUNCATION = '\n\n... (diagnostics truncated)'
const URL_TRUNCATION = '\n\n... (diagnostics truncated to fit the GitHub issue URL)'
const REPORT_BRAND = Symbol('DiagnosticReport')

export interface DiagnosticContext {
  muxSeshVersion?: string
  bunVersion?: string
  os?: string
  architecture?: string
  terminal?: string
  backend?: string
}

// `summary` and `text` are what is copied and shared, with Markdown neutralized for GitHub.
// `screen` is the same redacted, terminal-safe report with its plain characters, for display only.
export interface DiagnosticReport {
  readonly [REPORT_BRAND]: true
  readonly schemaVersion: 1
  readonly summary: string
  readonly text: string
  readonly screen: { readonly summary: string; readonly text: string }
  readonly issueUrl: string
  readonly truncated: boolean
  readonly issueUrlTruncated: boolean
}

const UNAVAILABLE_SUMMARY = 'Diagnostic capture unavailable'

const UNAVAILABLE_TEXT =
  'mux-sesh crashed\n\nDiagnostic capture failed; raw details were omitted. Report reproduction steps manually.'

const UNAVAILABLE_REPORT: DiagnosticReport = Object.freeze({
  [REPORT_BRAND]: true as const,
  schemaVersion: 1,
  summary: UNAVAILABLE_SUMMARY,
  text: UNAVAILABLE_TEXT,
  screen: Object.freeze({ summary: UNAVAILABLE_SUMMARY, text: UNAVAILABLE_TEXT }),
  issueUrl: ISSUE_URL,
  truncated: true,
  issueUrlTruncated: false,
})

type CapturedValue =
  | { readonly kind: 'absent' }
  | { readonly kind: 'error'; readonly error: Error }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'other'; readonly type: string }

const ABSENT: CapturedValue = { kind: 'absent' }

function decodeCause(cause: unknown): CapturedValue {
  if (cause === undefined) return ABSENT

  if (types.isNativeError(cause)) return { kind: 'error', error: cause }

  if (cause === null) return { kind: 'other', type: 'null' }

  // Thrown values and their fields arrive untyped; this is their single decode site.
  /* oxlint-disable anti-slop/no-runtime-typeof */
  if (typeof cause === 'string') return { kind: 'text', text: cause }

  return { kind: 'other', type: typeof cause }
  /* oxlint-enable anti-slop/no-runtime-typeof */
}

function ownField(owner: Error | DiagnosticContext, key: string): CapturedValue {
  if (types.isProxy(owner)) return ABSENT

  try {
    return decodeCause(Object.getOwnPropertyDescriptor(owner, key)?.value)
  } catch {
    return ABSENT
  }
}

function ownString(owner: Error | DiagnosticContext, key: string): string | undefined {
  const field = ownField(owner, key)

  return field.kind === 'text' ? field.text : undefined
}

function detectBackend(): string {
  if (process.env.HERDR_ENV === '1') return 'herdr'

  if (process.env.TMUX) return 'tmux'

  return 'unknown'
}

function detectTerminal(): string {
  if (process.env.TERM_PROGRAM) {
    return `${process.env.TERM_PROGRAM} ${process.env.TERM_PROGRAM_VERSION ?? ''}`
  }

  if (process.env.GHOSTTY_RESOURCES_DIR) return 'ghostty'

  return process.env.TERM || 'unknown'
}

interface IssueUrl {
  readonly url: string
  readonly truncated: boolean
}

function buildIssueUrl(summary: string, text: string): IssueUrl {
  const url = new URL(ISSUE_URL)
  url.searchParams.set('title', `Crash: ${summary.slice(0, 160).toWellFormed()}`)

  const prefix =
    '## What happened?\n\nPlease add reproduction steps.\n\n## Diagnostics\n\n```text\n'

  const setBody = (value: string): void => {
    url.searchParams.set('body', `${prefix}${value}\n\`\`\``)
  }

  setBody(text)

  if (url.toString().length <= MAX_ISSUE_URL_LENGTH)
    return { url: url.toString(), truncated: false }

  let low = 0
  let high = text.length

  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    setBody(text.slice(0, middle).toWellFormed() + URL_TRUNCATION)

    if (url.toString().length <= MAX_ISSUE_URL_LENGTH) low = middle
    else high = middle - 1
  }

  setBody(text.slice(0, low).toWellFormed() + URL_TRUNCATION)

  return { url: url.toString(), truncated: true }
}

// One piece of the report in both forms: `shared` for the clipboard and GitHub, `screen` for display.
interface ReportText {
  readonly shared: string
  readonly screen: string
}

const ReportText = {
  of(text: string): ReportText {
    return { shared: text, screen: text }
  },
  map(text: ReportText, transform: (value: string) => string): ReportText {
    return { shared: transform(text.shared), screen: transform(text.screen) }
  },
  prefix(prefix: string, text: ReportText): ReportText {
    return ReportText.map(text, value => `${prefix}${value}`)
  },
  join(lines: readonly ReportText[]): ReportText {
    return {
      shared: lines.map(line => line.shared).join('\n'),
      screen: lines.map(line => line.screen).join('\n'),
    }
  },
} as const

export const DiagnosticReport = {
  capture(cause: unknown, context: DiagnosticContext = {}): DiagnosticReport {
    try {
      let truncated = false

      const sanitize = (value: string, limit: number): ReportText => {
        const result = sanitizeDiagnosticText(value, limit)
        truncated ||= result.truncated

        return { shared: result.shared.trim(), screen: result.screen.trim() }
      }

      const field = (key: keyof DiagnosticContext, fallback: string): ReportText => {
        const value = ReportText.map(sanitize(ownString(context, key) || fallback, 200), text =>
          text.replace(/\s+/g, ' ')
        )

        return value.shared ? value : ReportText.of('unavailable')
      }

      const blank = ReportText.of('')

      // Keep runtime facts ahead of traces so size-limited reports retain them.
      const lines = [
        ReportText.of('mux-sesh crashed'),
        blank,
        ReportText.of('Environment:'),
        ReportText.prefix('mux-sesh: ', field('muxSeshVersion', CURRENT_VERSION)),
        ReportText.prefix('Bun: ', field('bunVersion', Bun.version)),
        ReportText.prefix('OS: ', field('os', `${platform()} ${release()}`)),
        ReportText.prefix('Architecture: ', field('architecture', arch())),
        ReportText.prefix('Terminal: ', field('terminal', detectTerminal())),
        ReportText.prefix('Backend: ', field('backend', detectBackend())),
      ]

      const seen = new Set<Error>()
      let current = decodeCause(cause)
      let summary = ReportText.of('')

      for (let depth = 0; depth <= 3; depth++) {
        if (current.kind === 'error' && seen.has(current.error)) {
          lines.push(blank, ReportText.of('Cause cycle omitted.'))
          truncated = true
          break
        }

        if (current.kind === 'error') seen.add(current.error)

        const rawMessage =
          current.kind === 'text'
            ? current.text
            : current.kind === 'error'
              ? ownString(current.error, 'message') ||
                ownString(current.error, 'name') ||
                'Error details unavailable'
              : `Non-Error failure (${current.kind === 'other' ? current.type : 'undefined'}; details omitted)`

        const sanitized = sanitize(rawMessage, 1024)
        const message = sanitized.shared ? sanitized : ReportText.of('Error details unavailable')

        if (depth === 0)
          summary = ReportText.map(message, text =>
            text.replace(/\s+/g, ' ').slice(0, 240).toWellFormed()
          )
        lines.push(blank, ReportText.of(depth === 0 ? 'Message:' : `Cause ${depth}:`), message)

        const stack =
          current.kind === 'error' && rawMessage.length <= MAX_DIAGNOSTIC_INPUT_LENGTH
            ? ownString(current.error, 'stack')
            : undefined

        if (stack)
          lines.push(blank, ReportText.of('Stack:'), sanitize(stack, depth === 0 ? 6000 : 2000))
        current = current.kind === 'error' ? ownField(current.error, 'cause') : ABSENT

        if (current.kind === 'absent') break

        if (depth === 3) truncated = true
      }

      let text = ReportText.join(lines)
      truncated ||= text.shared.length > MAX_DIAGNOSTIC_LENGTH

      if (truncated)
        text = ReportText.map(
          text,
          value =>
            value.slice(0, MAX_DIAGNOSTIC_LENGTH - REPORT_TRUNCATION.length).toWellFormed() +
            REPORT_TRUNCATION
        )
      const issue = buildIssueUrl(summary.shared, text.shared)

      return Object.freeze({
        [REPORT_BRAND]: true as const,
        schemaVersion: 1,
        summary: summary.shared,
        text: text.shared,
        screen: Object.freeze({ summary: summary.screen, text: text.screen }),
        issueUrl: issue.url,
        truncated,
        issueUrlTruncated: issue.truncated,
      })
    } catch {
      return UNAVAILABLE_REPORT
    }
  },
} as const
