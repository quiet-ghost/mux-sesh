import { describe, expect, test } from 'bun:test'
import { JsonSyntaxIssue } from '../src/settings/json-syntax'

describe('JsonSyntaxIssue.find', () => {
  test.each([
    ['', 1, 'a value'],
    ['   \n', 2, 'a value'],
    ['[\n  {\n    "listed": tru\n  }\n]', 3, 'true, false or null'],
    ['[1,]', 1, 'a value'],
    ['[1 2]', 1, ', or ]'],
    ['{"a": 1,}', 1, 'a quoted key'],
    ['{\n"a" 1}', 2, ':'],
    ['{"a": 1\n"b": 2}', 2, ', or }'],
    ['{a: 1}', 1, 'a quoted key or }'],
    ['"open', 1, 'a closing quote'],
    ['"tab\there"', 1, 'an escaped control character'],
    ['"\\x"', 1, 'a valid escape'],
    ['"\\u12g4"', 1, 'a valid escape'],
    ['-', 1, 'a digit'],
    ['01', 1, 'end of input'],
    ['1.', 1, 'a digit'],
    ['1e+', 1, 'a digit'],
    ['[]\n\n[]', 3, 'end of input'],
    ["['single']", 1, 'a value'],
  ])('%j fails on line %i, expecting %s', (text, line, expected) => {
    expect(() => {
      JSON.parse(text)
    }).toThrow()
    expect(JsonSyntaxIssue.find(text)).toEqual({ line, expected })
  })

  test.each([
    '[]',
    '{}',
    ' { "a" : [ 1, -2.5e+3, true, false, null, "x\\n\\u00e9\\"" ] } ',
    JSON.stringify({ projects: [{ path: '~/a', listed: true, icon: '' }] }, null, 2),
    '0',
    '"é ✓"',
  ])('accepts valid JSON %j', text => {
    expect(() => {
      JSON.parse(text)
    }).not.toThrow()
    expect(JsonSyntaxIssue.find(text)).toBeUndefined()
  })

  test('describes the issue by line', () => {
    expect(JsonSyntaxIssue.describe({ line: 5, expected: 'true, false or null' })).toBe(
      'Line 5: not valid JSON (expected true, false or null)'
    )
  })
})
