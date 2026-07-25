import { describe, expect, test } from 'bun:test'
import { getBrowserCommand, openBrowser } from '../src/util/browser'

describe('browser opener', () => {
  test('passes the full URL as one argument without shell interpolation', () => {
    const url = 'https://github.com/quiet-ghost/mux-sesh/issues/new?body=a%26b%3Bc'

    expect(getBrowserCommand(url, 'linux')).toEqual(['xdg-open', url])
    expect(getBrowserCommand(url, 'darwin')).toEqual(['open', url])
    expect(getBrowserCommand(url, 'win32')).toEqual([
      'rundll32.exe',
      'url.dll,FileProtocolHandler',
      url,
    ])
  })

  test('rejects non-http URLs before spawning a process', async () => {
    expect(await openBrowser('file:///tmp/private')).toBe(false)
    expect(await openBrowser('not a url')).toBe(false)
  })
})
