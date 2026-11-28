import { describe, expect, test } from 'bun:test'
import { getDefaultConfig } from '../src/config'
import { StringList, type ListContext } from '../src/settings/setting-lists'
import type { Config } from '../src/config/config-model'
import type { Item } from '../src/items/item'

const HOME = '/home/tester'

function config(overrides: Partial<Config> = {}): Config {
  return { ...getDefaultConfig(HOME), ...overrides }
}

function live(title: string): Item {
  return { title, desc: '', path: `/tmp/${title}`, isSession: true, itemKind: 'tmux' }
}

function project(path: string): Item {
  return { title: path, desc: '', path, isSession: false }
}

const CONTEXT: ListContext = {
  liveSessions: [live('scratch-1'), live('scratch-notes'), live('api')],
  projects: [project(`${HOME}/dev/a`), project(`${HOME}/dev/b`), project(`${HOME}/devx/c`)],
  folderExists: path => path === `${HOME}/dev` || path === `${HOME}/empty`,
}

function changed(change: ReturnType<typeof StringList.add>): Config {
  if (change.kind !== 'changed') throw new Error(`Expected a change, got ${change.kind}`)

  return change.config
}

describe('string list edits', () => {
  test('adding appends the trimmed value', () => {
    const next = changed(
      StringList.add(config({ hiddenSessions: ['_popup'] }), 'hiddenSessions', ' scratch-* ', HOME)
    )

    expect(next.hiddenSessions).toEqual(['_popup', 'scratch-*'])
  })

  test('a folder is stored with ~ expanded', () => {
    const next = changed(
      StringList.add(config({ projectPaths: [] }), 'projectPaths', '~/work', HOME)
    )

    expect(next.projectPaths).toEqual([`${HOME}/work`])
  })

  test('an empty value is required and saves nothing', () => {
    expect(StringList.add(config(), 'hiddenSessions', '   ', HOME)).toEqual({
      kind: 'invalid',
      message: 'A pattern is required',
    })
  })

  test('a duplicate is refused, folders compared after ~ expansion', () => {
    expect(StringList.add(config(), 'projectPaths', '~/dev/', HOME)).toEqual({
      kind: 'invalid',
      message: '~/dev is already in the list',
    })

    expect(
      StringList.add(config({ pinnedSessions: ['api'] }), 'pinnedSessions', 'api', HOME)
    ).toEqual({ kind: 'invalid', message: 'api is already in the list' })
  })

  test('editing replaces one value and may keep its own value', () => {
    const before = config({ hiddenSessions: ['a', 'b'] })

    expect(
      changed(StringList.replace(before, 'hiddenSessions', 1, 'c', HOME)).hiddenSessions
    ).toEqual(['a', 'c'])

    expect(StringList.replace(before, 'hiddenSessions', 1, 'b', HOME)).toEqual({
      kind: 'unchanged',
    })

    expect(StringList.replace(before, 'hiddenSessions', 1, 'a', HOME)).toEqual({
      kind: 'invalid',
      message: 'a is already in the list',
    })
  })

  test('removing and moving keep the other values in order', () => {
    const before = config({ pinnedSessions: ['a', 'b', 'c'] })

    expect(changed(StringList.remove(before, 'pinnedSessions', 1, HOME)).pinnedSessions).toEqual([
      'a',
      'c',
    ])

    expect(changed(StringList.move(before, 'pinnedSessions', 0, 1, HOME)).pinnedSessions).toEqual([
      'b',
      'a',
      'c',
    ])

    expect(StringList.move(before, 'pinnedSessions', 0, -1, HOME)).toEqual({ kind: 'unchanged' })
    expect(StringList.move(before, 'pinnedSessions', 2, 1, HOME)).toEqual({ kind: 'unchanged' })
  })

  test('a typed draft is checked before it is applied', () => {
    const before = config({ hiddenSessions: ['_popup'] })

    expect(StringList.check(before, 'hiddenSessions', '', HOME, CONTEXT)).toEqual({ kind: 'empty' })
    expect(StringList.check(before, 'hiddenSessions', 'scratch-*', HOME, CONTEXT)).toEqual({
      kind: 'ok',
    })

    expect(StringList.check(before, 'hiddenSessions', '_popup', HOME, CONTEXT)).toEqual({
      kind: 'invalid',
      message: '_popup is already in the list',
    })

    expect(StringList.check(config(), 'projectPaths', '~/nowhere', HOME, CONTEXT)).toEqual({
      kind: 'warning',
      message: '~/nowhere does not exist yet; it is scanned once it does',
    })
  })
})

describe('string list rows', () => {
  test('hidden patterns count the live sessions they hide', () => {
    expect(StringList.status('hiddenSessions', 'scratch-*', CONTEXT)).toBe('hides 2')
    expect(StringList.status('hiddenSessions', '_popup', CONTEXT)).toBe('hides 0')
    expect(StringList.detail('hiddenSessions', 'scratch-*', CONTEXT)).toBe(
      'Hides scratch-1 and scratch-notes'
    )
    expect(StringList.detail('hiddenSessions', '_popup', CONTEXT)).toBe('Hides no live session')
  })

  test('folders count their projects or say they are missing', () => {
    expect(StringList.status('projectPaths', `${HOME}/dev`, CONTEXT)).toBe('2 projects')
    expect(StringList.status('projectPaths', `${HOME}/empty`, CONTEXT)).toBe('no projects')
    expect(StringList.status('projectPaths', `${HOME}/gone`, CONTEXT)).toBe('missing')
    expect(StringList.display('projectPaths', `${HOME}/dev`, HOME)).toBe('~/dev')
  })

  test('pins that are not running say so', () => {
    expect(StringList.status('pinnedSessions', 'api', CONTEXT)).toBe('')
    expect(StringList.status('pinnedSessions', 'gone', CONTEXT)).toBe('not running')
  })
})
