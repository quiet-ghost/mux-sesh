import { describe, expect, test } from 'bun:test'
import { getLiveSessionGroupLabel, getLiveSessionSortKey } from '../src/items/session-groups'
import {
  getPathContextLabel,
  getPathGroupLabel,
  toHomeRelativePath,
} from '../src/util/path-display'

describe('toHomeRelativePath', () => {
  test('shows paths under an explicit home with a tilde', () => {
    expect(toHomeRelativePath('/home/tester', '/home/tester')).toBe('~')
    expect(toHomeRelativePath('/home/tester/dev/app', '/home/tester')).toBe('~/dev/app')
    expect(toHomeRelativePath('/home/testers/app', '/home/tester')).toBe('/home/testers/app')
    expect(toHomeRelativePath('', '/home/tester')).toBe('')
  })

  test('leaves paths unchanged when HOME is unset', () => {
    const originalHome = process.env.HOME
    delete process.env.HOME

    try {
      expect(toHomeRelativePath('/home/tester/dev/app')).toBe('/home/tester/dev/app')
      expect(toHomeRelativePath('/')).toBe('/')
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
    }
  })
})

describe('path display helpers', () => {
  test('returns the parent directory name for grouping', () => {
    expect(getPathGroupLabel('/home/tester/.dotfiles/.config/tmux')).toBe('.config')
    expect(getPathGroupLabel('/home/tester/dev/projects/blackjack')).toBe('projects')
    expect(getPathGroupLabel('/home/tester/dev/repos/sesh')).toBe('repos')
  })

  test('uses the parent project name for worktree grouping', () => {
    expect(
      getPathGroupLabel('/home/tester/dev/projects/mux-sesh/.worktrees/update-session-naming')
    ).toBe('mux-sesh')
  })

  test('marks live session worktrees in the group label', () => {
    expect(
      getLiveSessionGroupLabel(
        '/home/tester/dev/projects/mux-sesh/.worktrees/update-session-naming'
      )
    ).toBe('mux-sesh [worktree]')
  })

  test('collapses direct home children to tilde', () => {
    const originalHome = process.env.HOME
    process.env.HOME = '/home/tester'

    try {
      expect(getPathGroupLabel('/home/tester/scratch')).toBe('~')
    } finally {
      process.env.HOME = originalHome
    }
  })

  test('returns a home-relative parent path for project context', () => {
    const originalHome = process.env.HOME
    process.env.HOME = '/home/tester'

    try {
      expect(getPathContextLabel('/home/tester/dev/projects/blackjack')).toBe('~/dev/projects')
      expect(
        getPathContextLabel('/home/tester/dev/projects/mux-sesh/.worktrees/update-session-naming')
      ).toBe('~/dev/projects/mux-sesh [worktree]')
    } finally {
      process.env.HOME = originalHome
    }
  })

  test('uses the parent project as the live session sort key for worktrees', () => {
    expect(
      getLiveSessionSortKey(
        '/home/tester/dev/projects/mux-sesh/.worktrees/update-session-naming',
        'update-session-naming'
      )
    ).toBe('mux-sesh')
    expect(getLiveSessionSortKey('/home/tester/dev/projects/mux-sesh', 'mux-sesh')).toBe('mux-sesh')
  })
})
