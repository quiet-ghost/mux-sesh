import { describe, expect, test } from 'bun:test'
import { getDefaultConfig } from '../src/config'
import { IconsForm, NERD_FONT_ICONS } from '../src/settings-icons'

const config = getDefaultConfig('/home/tester')

describe('IconsForm', () => {
  test('lists the on/off row, then one glyph row per icon kind', () => {
    const entries = IconsForm.entries(config)

    expect(entries.map(entry => `${entry.row}: ${entry.title} = ${entry.value}`)).toEqual([
      'enabled: Icons = off',
      'tmux: tmux sessions = none',
      'herdr: Herdr workspaces = none',
      'configured: Configured projects = none',
      'project: Projects = none',
      'opencode: Agents = none',
    ])
    expect(entries.every(entry => entry.reset === 'default')).toBe(true)
  })

  test('a set glyph shows as the value and can be cleared', () => {
    const set = IconsForm.apply(config, { kind: 'set', icon: 'herdr', glyph: ' H ' })

    expect(set.icons?.herdr).toBe('H')

    const herdr = IconsForm.entries(set).find(entry => entry.row === 'herdr')
    expect(herdr).toMatchObject({ value: 'H', reset: 'available', control: 'open' })
    expect(IconsForm.entries(set)[0]).toMatchObject({ value: 'on', reset: 'unavailable' })

    expect(IconsForm.apply(set, { kind: 'clear', icon: 'herdr' }).icons?.herdr).toBe('')
  })

  test('turning icons on fills the Nerd Font set, and off clears every glyph', () => {
    const on = IconsForm.apply(config, { kind: 'toggle' })

    expect(on.icons).toEqual({ herdr: '', opencode: '', ...NERD_FONT_ICONS })

    const custom = IconsForm.apply(on, { kind: 'set', icon: 'opencode', glyph: 'A' })
    expect(IconsForm.apply(custom, { kind: 'toggle' }).icons).toEqual({
      tmux: '',
      herdr: '',
      configured: '',
      project: '',
      opencode: '',
    })
  })
})
