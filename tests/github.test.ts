import { describe, expect, test } from 'bun:test'
import { isGitHubURL, parseGitHubURL, sameGitHubRepository } from '../src/sessions/github-url'

describe('github utilities', () => {
  test('rejects unsafe repository names', () => {
    expect(parseGitHubURL('https://github.com/acme/..').kind).toBe('unsupported')
    expect(parseGitHubURL('git@github.com:acme/.git').kind).toBe('unsupported')
  })

  test('recognizes only supported GitHub clone URL shapes', () => {
    expect(isGitHubURL('https://github.com/acme/demo')).toBe(true)
    expect(isGitHubURL('git@github.com:acme/demo')).toBe(true)
    expect(isGitHubURL('https://example.com/acme/demo')).toBe(false)
  })

  test('canonicalizes each transport to one clone URL without query, fragment or suffix variants', () => {
    expect(parseGitHubURL(' https://github.com/acme/demo/?tab=readme#top ')).toEqual({
      kind: 'repository',
      repository: { owner: 'acme', repo: 'demo', url: 'https://github.com/acme/demo.git' },
    })
    expect(parseGitHubURL('git@github.com:acme/demo')).toEqual({
      kind: 'repository',
      repository: { owner: 'acme', repo: 'demo', url: 'git@github.com:acme/demo.git' },
    })
    expect(parseGitHubURL('http://github.com/acme/demo').kind).toBe('unsupported')
    expect(parseGitHubURL('https://github.com:8443/acme/demo').kind).toBe('unsupported')
  })

  test('a URL with a username or token is recognized but never carries the credentials onward', () => {
    for (const input of [
      'https://x-access-token:ghp_s3cret@github.com/acme/demo.git',
      'https://ghp_s3cret@github.com/acme/demo',
    ]) {
      const parsed = parseGitHubURL(input)

      expect(isGitHubURL(input)).toBe(true)
      expect(parsed).toEqual({
        kind: 'credentialed',
        repository: { owner: 'acme', repo: 'demo', url: 'https://github.com/acme/demo.git' },
      })
      expect(JSON.stringify(parsed)).not.toContain('s3cret')
    }
  })

  test('repository identity ignores transport and GitHub name case', () => {
    const https = parseGitHubURL('https://github.com/Acme/Demo')
    const ssh = parseGitHubURL('git@github.com:acme/demo.git')
    const other = parseGitHubURL('https://github.com/other/demo')

    if (https.kind !== 'repository' || ssh.kind !== 'repository' || other.kind !== 'repository')
      throw new Error('Expected three parsed repositories')

    expect(sameGitHubRepository(https.repository, ssh.repository)).toBe(true)
    expect(sameGitHubRepository(https.repository, other.repository)).toBe(false)
  })
})
