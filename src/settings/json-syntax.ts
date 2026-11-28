// Where JSON text stops being JSON. Bun's JSON.parse names no position, so the raw JSON editor
// scans the text itself to say which line to fix.
export interface JsonSyntaxIssue {
  readonly line: number
  readonly expected: string
}

class SyntaxStop {
  constructor(
    readonly at: number,
    readonly expected: string
  ) {}
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r'])
const ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't'])
const LITERALS = ['true', 'false', 'null'] as const

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9'
}

function isHex(char: string | undefined): boolean {
  return char !== undefined && /^[0-9a-fA-F]$/.test(char)
}

function scan(text: string): void {
  let at = 0

  const stop = (expected: string): never => {
    throw new SyntaxStop(at, expected)
  }

  const skipWhitespace = () => {
    while (at < text.length && WHITESPACE.has(text.charAt(at))) at++
  }

  const digits = () => {
    if (!isDigit(text[at])) stop('a digit')

    while (isDigit(text[at])) at++
  }

  const number = () => {
    if (text[at] === '-') at++

    if (text[at] === '0') at++
    else digits()

    if (text[at] === '.') {
      at++
      digits()
    }

    if (text[at] === 'e' || text[at] === 'E') {
      at++

      if (text[at] === '+' || text[at] === '-') at++
      digits()
    }
  }

  const string = () => {
    at++

    for (;;) {
      const char = text[at]

      if (char === undefined) stop('a closing quote')

      if (char === '"') {
        at++

        return
      }

      if (char !== undefined && char < ' ') stop('an escaped control character')

      if (char === '\\') {
        const escape = text[at + 1]

        if (escape === 'u') {
          if (![2, 3, 4, 5].every(offset => isHex(text[at + offset]))) stop('a valid escape')
          at += 6
        } else if (escape !== undefined && ESCAPES.has(escape)) {
          at += 2
        } else {
          stop('a valid escape')
        }
      } else {
        at++
      }
    }
  }

  const literal = () => {
    const word = LITERALS.find(candidate => text.startsWith(candidate, at))

    if (!word) stop('true, false or null')
    else at += word.length
  }

  const value = (): void => {
    skipWhitespace()

    const char = text[at]

    if (char === '{') object()
    else if (char === '[') array()
    else if (char === '"') string()
    else if (char === '-' || isDigit(char)) number()
    else if (char === 't' || char === 'f' || char === 'n') literal()
    else stop('a value')
  }

  const array = () => {
    at++
    skipWhitespace()

    if (text[at] === ']') {
      at++

      return
    }

    for (;;) {
      value()
      skipWhitespace()

      if (text[at] === ']') {
        at++

        return
      }

      if (text[at] !== ',') stop(', or ]')
      at++
    }
  }

  const key = (expected: string) => {
    skipWhitespace()

    if (text[at] !== '"') stop(expected)
    string()
    skipWhitespace()

    if (text[at] !== ':') stop(':')
    at++
    value()
    skipWhitespace()
  }

  const object = () => {
    at++
    skipWhitespace()

    if (text[at] === '}') {
      at++

      return
    }

    key('a quoted key or }')

    for (;;) {
      if (text[at] === '}') {
        at++

        return
      }

      if (text[at] !== ',') stop(', or }')
      at++
      key('a quoted key')
    }
  }

  value()
  skipWhitespace()

  if (at < text.length) stop('end of input')
}

function lineAt(text: string, offset: number): number {
  let line = 1

  for (let index = 0; index < offset && index < text.length; index++) {
    if (text[index] === '\n') line++
  }

  return line
}

// The first place the text is not JSON, or undefined when it parses.
function find(text: string): JsonSyntaxIssue | undefined {
  try {
    scan(text)

    return undefined
  } catch (cause) {
    if (!(cause instanceof SyntaxStop)) throw cause

    return { line: lineAt(text, cause.at), expected: cause.expected }
  }
}

function describe(issue: JsonSyntaxIssue): string {
  return `Line ${issue.line}: not valid JSON (expected ${issue.expected})`
}

export const JsonSyntaxIssue = { find, describe } as const
