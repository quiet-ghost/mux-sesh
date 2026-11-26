export type ClipboardResult =
  | { readonly kind: 'copied' }
  | { readonly kind: 'sent-unconfirmed' }
  | { readonly kind: 'unavailable' }

export interface ClipboardOutput {
  readonly isTTY?: boolean
  write(chunk: string): boolean
}

type ClipboardEnv = Readonly<Record<string, string | undefined>>

function osc52Sequence(text: string): string {
  return `\u001b]52;c;${Buffer.from(text).toString('base64')}\u0007`
}

export function buildClipboardSequence(text: string, env: ClipboardEnv = process.env): string {
  const sequence = osc52Sequence(text)

  return env.TMUX ? `\u001bPtmux;\u001b${sequence}\u001b\\` : sequence
}

// OSC 52 has no acknowledgement; a successful write only means the terminal received the request.
export function writeClipboard(
  text: string,
  output: ClipboardOutput = process.stdout,
  env: ClipboardEnv = process.env
): ClipboardResult {
  if (!text || !output.isTTY) return { kind: 'unavailable' }

  try {
    output.write(buildClipboardSequence(text, env))

    return { kind: 'sent-unconfirmed' }
  } catch {
    return { kind: 'unavailable' }
  }
}
