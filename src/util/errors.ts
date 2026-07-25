import { arch, homedir, platform, release } from 'os'
import { CURRENT_VERSION } from '../update/version'

const ISSUE_URL = 'https://github.com/quiet-ghost/mux-sesh/issues/new'
export const MAX_ISSUE_URL_LENGTH = 6000
const TRUNCATION_MARKER = '\n\n... (diagnostics truncated to fit the GitHub issue URL)'

export interface FailureDetails {
  message: string
  stack?: string
}

export interface DiagnosticContext {
  muxSeshVersion?: string
  bunVersion?: string
  os?: string
  architecture?: string
  terminal?: string
  backend?: string
}

function serializeUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'

  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value, null, 2)
      if (json && json !== '{}') return json

      const text = String(value)
      if (text !== '[object Object]') return text
      const names = Object.getOwnPropertyNames(value)
      return names.length > 0 ? `Object { ${names.join(', ')} }` : 'Object (no message)'
    } catch {
      return 'Unexpected failure (unserializable object)'
    }
  }

  return String(value)
}

export function describeFailure(error: unknown): FailureDetails {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || 'Unknown error',
      stack: error.stack,
    }
  }

  if (typeof error === 'object' && error !== null) {
    try {
      const message = Reflect.get(error, 'message')
      const stack = Reflect.get(error, 'stack')
      return {
        message: typeof message === 'string' && message ? message : serializeUnknown(error),
        stack: typeof stack === 'string' && stack ? stack : undefined,
      }
    } catch {
      return { message: serializeUnknown(error) }
    }
  }

  return { message: serializeUnknown(error) }
}

function replaceLiteral(value: string, literal: string, replacement: string): string {
  return literal ? value.split(literal).join(replacement) : value
}

export function redactDiagnosticText(value: string): string {
  let result = replaceLiteral(value, process.cwd(), '<cwd>')
  result = replaceLiteral(result, process.env.HOME ?? '', '~')
  result = replaceLiteral(result, homedir(), '~')
  return result
}

function bounded(value: string | undefined, fallback: string): string {
  const normalized = value?.trim() || fallback
  return redactDiagnosticText(normalized).slice(0, 300)
}

function detectBackend(): string {
  if (process.env.HERDR_ENV === '1') return 'herdr'
  if (process.env.TMUX) return 'tmux'
  return 'unknown'
}

function detectTerminal(): string {
  if (process.env.TERM_PROGRAM) {
    return [process.env.TERM_PROGRAM, process.env.TERM_PROGRAM_VERSION].filter(Boolean).join(' ')
  }
  if (process.env.GHOSTTY_RESOURCES_DIR) return 'ghostty'
  return process.env.TERM || 'unknown'
}

export function getDiagnosticContext(
  overrides: DiagnosticContext = {}
): Required<DiagnosticContext> {
  return {
    muxSeshVersion: bounded(overrides.muxSeshVersion, CURRENT_VERSION),
    bunVersion: bounded(overrides.bunVersion, Bun.version),
    os: bounded(overrides.os, `${platform()} ${release()}`),
    architecture: bounded(overrides.architecture, arch()),
    terminal: bounded(overrides.terminal, detectTerminal()),
    backend: bounded(overrides.backend, detectBackend()),
  }
}

export function formatDiagnostics(
  error: unknown,
  contextOverrides: DiagnosticContext = {}
): string {
  const failure = describeFailure(error)
  const context = getDiagnosticContext(contextOverrides)
  const lines = ['mux-sesh crashed', '', 'Message:', redactDiagnosticText(failure.message)]

  if (failure.stack) {
    lines.push('', 'Stack:', redactDiagnosticText(failure.stack))
  }

  lines.push(
    '',
    'Environment:',
    `mux-sesh: ${context.muxSeshVersion}`,
    `Bun: ${context.bunVersion}`,
    `OS: ${context.os}`,
    `Architecture: ${context.architecture}`,
    `Terminal: ${context.terminal}`,
    `Backend: ${context.backend}`
  )

  return lines.join('\n')
}

export function buildIssueUrl(error: unknown, diagnostics = formatDiagnostics(error)): URL {
  const failure = describeFailure(error)
  const safeDiagnostics = redactDiagnosticText(diagnostics)
  const title = redactDiagnosticText(failure.message).replaceAll('\n', ' ').slice(0, 160)
  const url = new URL(ISSUE_URL)
  url.searchParams.set('title', `Crash: ${title}`)

  const prefix = [
    '## What happened?',
    '',
    'mux-sesh generated this report after an unexpected crash. Please add any reproduction steps above the diagnostics.',
    '',
    '## Diagnostics',
    '',
    '```text',
  ].join('\n')
  const suffix = '\n```'
  const setBody = (value: string) => url.searchParams.set('body', `${prefix}\n${value}${suffix}`)

  setBody(safeDiagnostics)
  if (url.toString().length <= MAX_ISSUE_URL_LENGTH) return url

  let low = 0
  let high = safeDiagnostics.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    setBody(safeDiagnostics.slice(0, middle) + TRUNCATION_MARKER)
    if (url.toString().length <= MAX_ISSUE_URL_LENGTH) low = middle
    else high = middle - 1
  }

  setBody(safeDiagnostics.slice(0, low) + TRUNCATION_MARKER)
  return url
}
