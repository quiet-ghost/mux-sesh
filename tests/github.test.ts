import { describe, expect, test } from 'bun:test'
import { extractRepoName, isGitHubURL } from '../src/util/github'

describe('github utilities', () => {
  test('extracts repository names from supported GitHub URLs', () => {
    expect(extractRepoName('https://github.com/acme/demo.git')).toBe('demo')
    expect(extractRepoName('git@github.com:acme/demo.git')).toBe('demo')
  })

  test('rejects unsafe repository names', () => {
    expect(extractRepoName('https://github.com/acme/..')).toBe('')
    expect(extractRepoName('git@github.com:acme/.git')).toBe('')
  })

  test('recognizes only supported GitHub clone URL shapes', () => {
    expect(isGitHubURL('https://github.com/acme/demo')).toBe(true)
    expect(isGitHubURL('git@github.com:acme/demo')).toBe(true)
    expect(isGitHubURL('https://example.com/acme/demo')).toBe(false)
  })
})
