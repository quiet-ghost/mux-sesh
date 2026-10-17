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

export interface DiagnosticReport {
  readonly [REPORT_BRAND]: true
  readonly schemaVersion: 1
  readonly summary: string
  readonly text: string
  readonly issueUrl: string
  readonly truncated: boolean
  readonly issueUrlTruncated: boolean
}

const UNAVAILABLE_REPORT: DiagnosticReport = Object.freeze({
  [REPORT_BRAND]: true as const,
  schemaVersion: 1,
  summary: 'Diagnostic capture unavailable',
  text: 'mux-sesh crashed\n\nDiagnostic capture failed; raw details were omitted. Report reproduction steps manually.',
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

export const DiagnosticReport = {
  capture(cause: unknown, context: DiagnosticContext = {}): DiagnosticReport {
    try {
      let truncated = false

      const sanitize = (value: string, limit: number): string => {
        const result = sanitizeDiagnosticText(value, limit)
        truncated ||= result.truncated

        return result.text.trim()
      }

      const field = (key: keyof DiagnosticContext, fallback: string): string =>
        sanitize(ownString(context, key) || fallback, 200).replace(/\s+/g, ' ') || 'unavailable'

      // Keep runtime facts ahead of traces so size-limited reports retain them.
      const lines = [
        'mux-sesh crashed',
        '',
        'Environment:',
        `mux-sesh: ${field('muxSeshVersion', CURRENT_VERSION)}`,
        `Bun: ${field('bunVersion', Bun.version)}`,
        `OS: ${field('os', `${platform()} ${release()}`)}`,
        `Architecture: ${field('architecture', arch())}`,
        `Terminal: ${field('terminal', detectTerminal())}`,
        `Backend: ${field('backend', detectBackend())}`,
      ]

      const seen = new Set<Error>()
      let current = decodeCause(cause)
      let summary = ''

      for (let depth = 0; depth <= 3; depth++) {
        if (current.kind === 'error' && seen.has(current.error)) {
          lines.push('', 'Cause cycle omitted.')
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

        const message = sanitize(rawMessage, 1024) || 'Error details unavailable'

        if (depth === 0) summary = message.replace(/\s+/g, ' ').slice(0, 240).toWellFormed()
        lines.push('', depth === 0 ? 'Message:' : `Cause ${depth}:`, message)

        const stack =
          current.kind === 'error' && rawMessage.length <= MAX_DIAGNOSTIC_INPUT_LENGTH
            ? ownString(current.error, 'stack')
            : undefined

        if (stack) lines.push('', 'Stack:', sanitize(stack, depth === 0 ? 6000 : 2000))
        current = current.kind === 'error' ? ownField(current.error, 'cause') : ABSENT

        if (current.kind === 'absent') break

        if (depth === 3) truncated = true
      }

      let text = lines.join('\n')
      truncated ||= text.length > MAX_DIAGNOSTIC_LENGTH

      if (truncated)
        text =
          text.slice(0, MAX_DIAGNOSTIC_LENGTH - REPORT_TRUNCATION.length).toWellFormed() +
          REPORT_TRUNCATION
      const issue = buildIssueUrl(summary, text)

      return Object.freeze({
        [REPORT_BRAND]: true as const,
        schemaVersion: 1,
        summary,
        text,
        issueUrl: issue.url,
        truncated,
        issueUrlTruncated: issue.truncated,
      })
    } catch {
      return UNAVAILABLE_REPORT
    }
  },
} as const
