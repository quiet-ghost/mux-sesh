function osc52Sequence(text: string): string {
  return `\u001b]52;c;${Buffer.from(text).toString('base64')}\u0007`
}

export function buildClipboardSequence(
  text: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const sequence = osc52Sequence(text)
  return env.TMUX ? `\u001bPtmux;\u001b${sequence}\u001b\\` : sequence
}

export function writeClipboard(text: string): boolean {
  if (!text || !process.stdout.isTTY) return false

  try {
    process.stdout.write(buildClipboardSequence(text))
    return true
  } catch {
    return false
  }
}
