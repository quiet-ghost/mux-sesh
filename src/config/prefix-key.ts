// What `prefix_key` may hold when it is typed in Settings: the keys the keyboard's prefix match
// (matchesPrefixKey) reads, written the way it reads them. The file itself still takes any text.
export type PrefixKeyParse =
  | { readonly kind: 'parsed'; readonly key: string }
  | { readonly kind: 'invalid'; readonly reason: string }

const MODIFIERS = ['ctrl', 'shift'] as const
const FUNCTION_KEYS = Array.from({ length: 12 }, (_, index) => `f${index + 1}`)
const NAMED_KEYS: ReadonlySet<string> = new Set(['space', 'tab', ...FUNCTION_KEYS])

type Modifier = (typeof MODIFIERS)[number]

function asModifier(text: string): Modifier | undefined {
  return MODIFIERS.find(modifier => modifier === text)
}

function invalid(reason: string): PrefixKeyParse {
  return { kind: 'invalid', reason }
}

function parse(text: string): PrefixKeyParse {
  const written = text.trim().toLowerCase()

  if (written.length === 0) return invalid('Type a key, such as ctrl+a')

  const parts = written.split('+')
  const name = parts.at(-1) ?? ''

  if (name.length === 0)
    return invalid(`"${written}" names no key; end it with one, such as ctrl+a`)

  const modifiers = new Set<Modifier>()

  for (const part of parts.slice(0, -1)) {
    const modifier = asModifier(part)

    if (!modifier) return invalid(`"${part}" is not a modifier mux-sesh reads; use ctrl or shift`)

    if (modifiers.has(modifier)) return invalid(`"${part}" is written twice`)
    modifiers.add(modifier)
  }

  if (name.length > 1 && !NAMED_KEYS.has(name))
    return invalid(`"${name}" is not a key here; use one character, space, tab or f1–f12`)

  // Without ctrl, a letter or digit is typing in standard mode and an action in vim mode.
  if (/^[a-z0-9]$/.test(name) && !modifiers.has('ctrl'))
    return invalid(`${written} alone would type into search; add ctrl, such as ctrl+${name}`)

  const key = [...MODIFIERS.filter(modifier => modifiers.has(modifier)), name].join('+')

  return { kind: 'parsed', key }
}

export const PrefixKey = { parse } as const
