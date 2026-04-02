export interface MatchGlobOptions {
  pathSeparatorAware?: boolean
}

function escapeRegexCharacter(value: string): string {
  return /[|\\{}()[\]^$+?.]/.test(value) ? `\\${value}` : value
}

export function normalizePathForMatching(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/'
}

export function globToRegExp(pattern: string, options: MatchGlobOptions = {}): RegExp {
  const { pathSeparatorAware = false } = options
  let regex = '^'

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    const next = pattern[index + 1]

    if (char === '*' && next === '*') {
      regex += '.*'
      index += 1
      continue
    }

    if (char === '*') {
      regex += pathSeparatorAware ? '[^/]*' : '.*'
      continue
    }

    if (char === '?') {
      regex += pathSeparatorAware ? '[^/]' : '.'
      continue
    }

    regex += escapeRegexCharacter(char)
  }

  regex += '$'

  return new RegExp(regex)
}

export function matchesGlob(
  value: string,
  pattern: string,
  options: MatchGlobOptions = {}
): boolean {
  return globToRegExp(pattern, options).test(value)
}
