export function stripAnsi(value: string): string {
  // oxlint-disable-next-line no-control-regex -- ANSI escape sequences start with ESC.
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
}
