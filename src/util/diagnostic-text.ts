import { resolve } from 'path'

export const MAX_DIAGNOSTIC_INPUT_LENGTH = 16_384
const APP_SOURCE = `${resolve(import.meta.dir, '../..')}/src/`

const MARKDOWN_REPLACEMENTS: Readonly<Record<string, string>> = {
  '\\': '＼',
  '`': 'ˋ',
  '*': '∗',
  _: '＿',
  '{': '｛',
  '}': '｝',
  '[': '［',
  ']': '］',
  '(': '（',
  ')': '）',
  '<': '‹',
  '>': '›',
  '#': '＃',
  '!': '！',
  '|': '｜',
  '~': '∼',
  '&': '＆',
}

interface SanitizedDiagnosticText {
  readonly text: string
  readonly truncated: boolean
}

export function sanitizeDiagnosticText(value: string, limit: number): SanitizedDiagnosticText {
  let truncated = value.length > MAX_DIAGNOSTIC_INPUT_LENGTH
  let text = value.slice(0, MAX_DIAGNOSTIC_INPUT_LENGTH).toWellFormed().normalize('NFKC')
  truncated ||= text.length > MAX_DIAGNOSTIC_INPUT_LENGTH
  text = text
    .slice(0, MAX_DIAGNOSTIC_INPUT_LENGTH)
    .toWellFormed()
    .replace(/(?:\u001b\]|\u009d)[\s\S]*?(?:\u0007|\u001b\\|\u009c|$)/g, '')
    .replace(/(?:\u001b[PX^_]|[\u0090\u0098\u009e\u009f])[\s\S]*?(?:\u001b\\|\u009c|$)/g, '')
    .replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*(?:[@-~]|$)/g, '')
    .replace(/\u001b[ -/]*[0-~]/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]|\p{Cf}/gu, '')
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/gi,
      '‹private key redacted›'
    )
    .replace(/\b[a-z][a-z\d+.-]{1,20}(?::|%3a)(?:\/|%2f){2}[^\n]*/gi, '‹URL redacted›')
    .replace(
      /\b(?:https?|wss?|ftp|sftp|ssh|postgres(?:ql)?|mysql|rediss?|mongodb|file|data|mailto|javascript)(?::|%3a)[^\n]*/gi,
      '‹URL redacted›'
    )
    .replace(
      /(\b(?:proxy-authorization|authorization|set-cookie|cookie)\s*:\s*)[^\n]*(?:\n[ \t]+[^\n]*)*/gi,
      '$1‹redacted›'
    )
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;"']+/gi, '‹authorization redacted›')
    .replace(
      /\b(?:sk-(?:proj-|ant-)?|gh[pousr]_|github_pat_|glpat-|xox[baprs]-)[a-z\d_-]+/gi,
      '‹credential redacted›'
    )
    .replace(/\bAKIA[A-Z\d]{16}\b/g, '‹credential redacted›')
    .replace(/\beyJ[a-z\d_-]+\.[a-z\d_-]+\.[a-z\d_-]+/gi, '‹credential redacted›')
    .replace(
      /((?:password|passwd|passphrase|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization|credential|cookie)[\w.-]{0,64}["']?\s*[:=]\s*)(?:"(?:\\[\s\S]|[^"\\])*(?:"|\\?$)|'(?:\\[\s\S]|[^'\\])*(?:'|\\?$)|[^\n]+)/gi,
      '$1‹redacted›'
    )
    .replaceAll(APP_SOURCE, '‹app›/src/')
    // Consume the path-bearing tail: unquoted paths can contain private names with spaces.
    .replace(
      /(^|[\s("'=,:<\[`])(?:~[\/\\]|\.\.?[\/\\]|[a-z]:[\/\\]|[\/\\])[^\n]*/gim,
      '$1‹path redacted›'
    )
    .replace(/[\\`*_{}\[\]()<>#!|~&]/g, character => MARKDOWN_REPLACEMENTS[character] ?? '�')

  truncated ||= text.length > limit
  return { text: text.slice(0, limit).toWellFormed(), truncated }
}
