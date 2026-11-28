import { describe, expect, test } from 'bun:test'
import { getDefaultConfig } from '../src/config'
import type { SettingChange } from '../src/settings/setting-change'
import { Rules } from '../src/settings/setting-rules'
import type { Config } from '../src/types'

const HOME = '/home/tester'

function config(overrides: Partial<Config> = {}): Config {
  return { ...getDefaultConfig(HOME), ...overrides }
}

function first(config: Config) {
  const entry = Rules.entries(config, 'projects')[0]

  if (!entry) throw new Error('No project rule')

  return entry
}

function changed(change: SettingChange): Config {
  if (change.kind !== 'changed') throw new Error(`Expected a change, got ${JSON.stringify(change)}`)

  return change.config
}

const API = { path: `${HOME}/work/api`, sessionName: 'api', listed: true }
const HYPR = { path: `${HOME}/.config/hypr`, sessionName: 'hyprland', startupCommand: 'nvim' }

describe('rule list edits', () => {
  test('adding a project rule expands ~ and keeps only the path', () => {
    const next = changed(Rules.add(config(), 'projects', '~/work/api', HOME))

    expect(next.projects).toEqual([{ path: `${HOME}/work/api` }])
  })

  test('adding a wildcard rule keeps its pattern', () => {
    const next = changed(Rules.add(config(), 'wildcards', '~/work/**', HOME))

    expect(next.wildcards).toEqual([{ pattern: `${HOME}/work/**` }])
  })

  test('a path is required and must not repeat another rule', () => {
    const before = config({ projects: [API] })

    expect(Rules.add(before, 'projects', ' ', HOME)).toEqual({
      kind: 'invalid',
      message: 'A folder is required',
    })

    expect(Rules.add(before, 'projects', '~/work/api/', HOME)).toEqual({
      kind: 'invalid',
      message: 'There is already a rule for ~/work/api',
    })
  })

  test('a missing folder is only a warning', () => {
    const exists = (path: string) => path === `${HOME}/work/api`

    expect(Rules.checkKey(config(), 'projects', '~/work/ap', HOME, exists)).toEqual({
      kind: 'warning',
      message: '~/work/ap does not exist yet; the rule applies once it does',
    })

    expect(Rules.checkKey(config(), 'wildcards', '~/nowhere/**', HOME, exists)).toEqual({
      kind: 'ok',
    })
  })

  test('removing and moving keep the other rules in order', () => {
    const before = config({ projects: [API, HYPR] })

    expect(changed(Rules.remove(before, 'projects', 0, HOME)).projects).toEqual([HYPR])
    expect(changed(Rules.move(before, 'projects', 0, 1, HOME)).projects).toEqual([HYPR, API])
    expect(Rules.move(before, 'projects', 1, 1, HOME)).toEqual({ kind: 'unchanged' })
  })
})

describe('rule summaries', () => {
  test('a row sums up the overrides only', () => {
    expect(Rules.summary(first(config({ projects: [HYPR] })))).toBe('hyprland · nvim')
    expect(Rules.summary(first(config({ projects: [API] })))).toBe('api · listed')
    expect(Rules.summary({ key: '/x' })).toBe('defaults')
  })

  test('the selected rule is described in a sentence', () => {
    expect(
      Rules.detail({ key: '/x', sessionName: 'hyprland', startupCommand: 'nvim', listed: true })
    ).toBe('Session hyprland, starts nvim, listed before it has a session')
  })
})

describe('rule form', () => {
  test('unset fields show what they inherit', () => {
    const rows = Rules.form(config({ projects: [API] }), 'projects', 0, HOME)

    expect(rows.map(row => [row.label, row.value.text, row.value.kind])).toEqual([
      ['Path', '~/work/api', 'set'],
      ['Session name', 'api', 'set'],
      ['Startup command', 'default · nvim (Telescope)', 'inherited'],
      ['Preview command', 'default · directory listing', 'inherited'],
      ['Listed', 'on', 'set'],
      ['Icon', 'default', 'inherited'],
    ])
  })

  test('a wildcard rule has no Listed or Icon field', () => {
    const rows = Rules.form(config({ wildcards: [{ pattern: '/w/**' }] }), 'wildcards', 0, HOME)

    expect(rows.map(row => row.label)).toEqual([
      'Pattern',
      'Session name',
      'Startup command',
      'Preview command',
    ])
  })

  test('a text field saves its value, and an empty value clears the override', () => {
    const before = config({ projects: [API] })

    expect(
      changed(Rules.setText(before, 'projects', 0, 'startupCommand', 'bun run dev', HOME)).projects
    ).toEqual([{ ...API, startupCommand: 'bun run dev' }])

    expect(
      changed(Rules.setText(before, 'projects', 0, 'sessionName', '  ', HOME)).projects
    ).toEqual([{ path: API.path, listed: true }])
  })

  test('the path cannot be emptied or moved onto another rule', () => {
    const before = config({ projects: [API, HYPR] })

    expect(Rules.setText(before, 'projects', 1, 'key', '', HOME)).toEqual({
      kind: 'invalid',
      message: 'A folder is required',
    })

    expect(Rules.setText(before, 'projects', 1, 'key', '~/work/api', HOME)).toEqual({
      kind: 'invalid',
      message: 'There is already a rule for ~/work/api',
    })

    expect(changed(Rules.setText(before, 'projects', 1, 'key', '~/dots', HOME)).projects).toEqual([
      API,
      { ...HYPR, path: `${HOME}/dots` },
    ])
  })

  test('Listed toggles, and reset clears it back to inherited', () => {
    const before = config({ projects: [{ path: '/p' }] })
    const on = changed(Rules.toggle(before, 'projects', 0, HOME))

    expect(on.projects).toEqual([{ path: '/p', listed: true }])
    expect(changed(Rules.toggle(on, 'projects', 0, HOME)).projects).toEqual([
      { path: '/p', listed: false },
    ])
    expect(changed(Rules.clear(on, 'projects', 0, 'listed', HOME)).projects).toEqual([
      { path: '/p' },
    ])
  })

  test('only overrides can be reset; the path never', () => {
    const rows = Rules.form(config({ projects: [API] }), 'projects', 0, HOME)

    expect(rows.map(row => `${row.field}:${row.reset}`)).toEqual([
      'key:none',
      'sessionName:available',
      'startupCommand:none',
      'previewCommand:none',
      'listed:available',
      'icon:none',
    ])
  })
})
