// Reads the picker's bottom footer row as rendered: screen actions on the left, actions on the
// selected row on the right, then the version badge at the far right.

export type HintPair = readonly [label: string, key: string]

export interface FooterRow {
  readonly global: string
  readonly target: string
  readonly version: string
}

const HINT_SEPARATOR = '  '
const GROUP_GAP = /\s{3,}/
const VERSION = /\s{2,}(v\d+\.\d+\.\d+(?: -> v\d+\.\d+\.\d+)?|dev)\s*$/

export function hint(label: string, key: string): string {
  return key ? `${label} ${key}` : label
}

export function hints(...pairs: readonly HintPair[]): string {
  return pairs.map(([label, key]) => hint(label, key)).join(HINT_SEPARATOR)
}

export function footerLineOf(frame: string): string {
  const line = frame.split('\n').findLast(row => row.trim() !== '')

  if (line === undefined) throw new Error(`No footer row was rendered:\n${frame}`)

  return line
}

export function readFooter(frame: string): FooterRow {
  const line = footerLineOf(frame)
  const version = VERSION.exec(line)

  if (!version) throw new Error(`The footer row has no version badge:\n${line}`)

  const body = line.slice(0, version.index)
  const groups = body.trim().split(GROUP_GAP).filter(Boolean)

  if (groups.length > 2) throw new Error(`The footer row has more than two groups:\n${line}`)

  const [first = '', second = ''] = groups

  // A lone group is the left one only if it starts at the footer's left padding.
  if (groups.length === 1 && !body.startsWith(` ${first}`)) {
    return { global: '', target: first, version: version[1] ?? '' }
  }

  return { global: first, target: second, version: version[1] ?? '' }
}

export function footerGroups(frame: string): Pick<FooterRow, 'global' | 'target'> {
  const { global, target } = readFooter(frame)

  return { global, target }
}

// Every rendered hint as `label key`, left group first.
export function footerHints(frame: string): string[] {
  const { global, target } = readFooter(frame)

  return [...global.split(HINT_SEPARATOR), ...target.split(HINT_SEPARATOR)].filter(Boolean)
}
