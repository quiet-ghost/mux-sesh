export function stripAnsi(value: string): string {
  // oxlint-disable-next-line no-control-regex -- ANSI escape sequences start with ESC.
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

// Backend text can carry terminal escapes and control characters; screens show plain text.
export function toPlainText(value: string): string {
  return stripAnsi(value).replace(/\p{Cc}+/gu, ' ')
}
