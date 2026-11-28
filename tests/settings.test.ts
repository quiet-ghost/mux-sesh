import { describe, expect, test } from 'bun:test'
import * as Schema from 'effect/Schema'
import { getDefaultConfig, normalizeConfig, serializeConfig } from '../src/config'
import {
  applyEditorSetting,
  applyOptionSetting,
  editSetting,
  getSettingEditorTitle,
  getSettingEditorValue,
  getSettingOptions,
  getSettingsEntries,
  getSettingDisplayValue,
  isOptionSetting,
  resetSetting,
  stepSetting,
  type SettingsEntry,
} from '../src/settings'

const decodeJsonText = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))

describe('settings metadata', () => {
  const config = getDefaultConfig('/home/tester')

  function entry(entries: readonly SettingsEntry[], id: SettingsEntry['id']): SettingsEntry {
    const found = entries.find(candidate => candidate.id === id)

    if (!found) throw new Error(`No ${id} setting`)

    return found
  }

  test('lists every setting by category in display order with sentence-case titles', () => {
    const entries = getSettingsEntries(config, '/home/tester')

    expect(entries.map(setting => `${setting.category}: ${setting.title}`)).toEqual([
      'Appearance: Theme',
      'Appearance: Color scheme',
      'Appearance: Icons',
      'Keys: Keybind mode',
      'Keys: Prefix key',
      'Sessions: Sort order',
      'Sessions: Pinned sessions',
      'Sessions: Hidden sessions',
      'Sessions: Name depth',
      'Launch: Startup command',
      'Launch: Preview command',
      'Launch: File editor',
      'Projects: Project folders',
      'Projects: Project rules',
      'Projects: Wildcard rules',
      'Projects: Zoxide',
      'Projects: Clone folder',
      'General: Backend',
      'General: Auto update',
      'General: Search history',
    ])
  })

  test('rows show readable values: theme names, option labels, counts and short paths', () => {
    const entries = getSettingsEntries(
      { ...config, theme: 'github', sortOrder: 'alphabetical', pinnedSessions: ['a', 'b'] },
      '/home/tester'
    )

    expect(entry(entries, 'theme').value).toBe('GitHub')
    expect(entry(entries, 'sortOrder').value).toBe('A–Z')
    expect(entry(entries, 'pinnedSessions').value).toBe('2')
    expect(entry(entries, 'hiddenSessions').value).toBe('none')
    expect(entry(entries, 'startupCommand').value).toBe('nvim (Telescope)')
    expect(entry(entries, 'previewCommand').value).toBe('directory listing')
    expect(entry(entries, 'autoUpdate').value).toBe('on')
    expect(entry(entries, 'zoxideMode').value).toBe('off')
  })

  test('each kind declares what ←/→ and Enter do', () => {
    const entries = getSettingsEntries(config, '/home/tester')

    expect(entry(entries, 'theme').control).toBe('open')
    expect(entry(entries, 'prefixKey').control).toBe('open')
    expect(entry(entries, 'colorScheme').control).toBe('cycle')
    expect(entry(entries, 'keybindMode').control).toBe('toggle')
    expect(entry(entries, 'dirLength').control).toBe('step')
    expect(entry(entries, 'startupCommand').control).toBe('open')
    expect(entry(entries, 'projects').control).toBe('open')
  })

  test('a changed value offers a reset, except lists, which are never reset with one key', () => {
    const changed = { ...config, sortOrder: 'alphabetical' as const, hiddenSessions: ['tmp-*'] }
    const entries = getSettingsEntries(changed, '/home/tester')

    expect(entry(getSettingsEntries(config, '/home/tester'), 'sortOrder').reset).toBe('default')
    expect(entry(entries, 'sortOrder').reset).toBe('available')
    expect(entry(entries, 'hiddenSessions').reset).toBe('unavailable')

    expect(resetSetting(changed, 'sortOrder', '/home/tester')?.sortOrder).toBe('live-first')
    expect(resetSetting(changed, 'hiddenSessions', '/home/tester')).toBeUndefined()
    expect(resetSetting(config, 'sortOrder', '/home/tester')).toBeUndefined()
  })

  test('resetting text writes the default through a reload', () => {
    const changed = applyEditorSetting(config, 'startupCommand', 'helix', '/home/tester')
    const reset = resetSetting(changed, 'startupCommand', '/home/tester')

    expect(reset?.defaultSession?.startupCommand).toBe(config.defaultSession?.startupCommand)
    expect(resetSetting({ ...config, dirLength: 4 }, 'dirLength', '/home/tester')?.dirLength).toBe(
      1
    )
  })

  test('choices cycle in place and wrap around', () => {
    expect(stepSetting(config, 'sortOrder', 1)?.sortOrder).toBe('configured-first')
    expect(stepSetting(config, 'sortOrder', -1)?.sortOrder).toBe('alphabetical')
    expect(stepSetting(config, 'keybindMode', 1)?.keybindMode).toBe('standard')
    expect(stepSetting(config, 'autoUpdate', 1)?.autoUpdate).toBe(false)
    expect(stepSetting(config, 'backend', 1)?.backend).toBe('tmux')
  })

  test('resolves option settings and editor metadata from the same field definitions', () => {
    expect(isOptionSetting('theme')).toBe(true)
    expect(isOptionSetting('reposPath')).toBe(false)
    expect(getSettingEditorTitle('previewCommand')).toBe('Preview command')
    expect(getSettingEditorValue(config, 'projectPaths')).toBe(
      JSON.stringify(config.projectPaths, null, 2)
    )
    expect(getSettingOptions(config, 'prefixKey').map(option => option.value)).toContain('ctrl+x')
  })

  test('applies option and editor updates through shared field definitions', () => {
    const nextConfig = applyOptionSetting(config, 'keybindMode', 'standard')
    const updatedConfig = applyEditorSetting(nextConfig, 'reposPath', '~/src/repos', '/home/tester')

    expect(nextConfig.keybindMode).toBe('standard')
    expect(updatedConfig.reposPath).toBe('/home/tester/src/repos')
  })

  test('JSON editor updates keep valid entries and the rest of the config', () => {
    const updatedConfig = applyEditorSetting(
      config,
      'projects',
      JSON.stringify([{ path: '~/dev/app', listed: false }, { path: '' }, 'stray', 3]),
      '/home/tester'
    )

    expect(updatedConfig.projects).toEqual([
      {
        path: '/home/tester/dev/app',
        sessionName: undefined,
        startupCommand: undefined,
        previewCommand: undefined,
        listed: false,
        icon: undefined,
      },
    ])

    expect(updatedConfig.projectPaths).toEqual(config.projectPaths)
    expect(updatedConfig.icons).toEqual(config.icons)
    expect(() => applyEditorSetting(config, 'projects', '[{', '/home/tester')).toThrow()
  })

  test('the startup command survives a save and reload', () => {
    const updated = applyEditorSetting(config, 'startupCommand', 'helix', '/home/tester')

    const reloaded = normalizeConfig(
      decodeJsonText(JSON.stringify(serializeConfig(updated))),
      '/home/tester'
    )

    expect(reloaded.defaultSession?.startupCommand).toBe('helix')
    expect(getSettingEditorValue(reloaded, 'startupCommand')).toBe('helix')
  })

  test('a legacy editor_cmd is the startup command until one is set', () => {
    const legacy = normalizeConfig({ editor_cmd: 'hx .' }, '/home/tester')

    expect(getSettingEditorValue(legacy, 'startupCommand')).toBe('hx .')
    expect(getSettingsEntries(legacy, '/home/tester').some(row => row.value === 'hx .')).toBe(true)
  })

  test('Name depth steps from 1 to 6 and previews the path segments it keeps', () => {
    expect(getSettingDisplayValue(config, 'dirLength')).toBe('1 · mux-sesh')

    const two = stepSetting(config, 'dirLength', 1)
    expect(two?.dirLength).toBe(2)
    expect(two && getSettingDisplayValue(two, 'dirLength')).toBe('2 · dev/mux-sesh')
    expect(two && stepSetting(two, 'dirLength', 1)?.dirLength).toBe(3)

    expect(stepSetting(config, 'dirLength', -1)).toBeUndefined()
    expect(stepSetting({ ...config, dirLength: 6 }, 'dirLength', 1)).toBeUndefined()
    expect(stepSetting({ ...config, dirLength: 6 }, 'dirLength', -1)?.dirLength).toBe(5)
  })

  test('text, lists and open-only choices do not step', () => {
    expect(stepSetting(config, 'reposPath', 1)).toBeUndefined()
    expect(stepSetting(config, 'theme', 1)).toBeUndefined()
    expect(stepSetting(config, 'projects', 1)).toBeUndefined()
  })

  test('sets and clears backend preference', () => {
    const herdrConfig = applyOptionSetting(config, 'backend', 'herdr')
    expect(herdrConfig.backend).toBe('herdr')
    expect(applyOptionSetting(herdrConfig, 'backend', 'auto').backend).toBeUndefined()
  })

  test('theme options start with system and never include omarchy', () => {
    const values = getSettingOptions(config, 'theme').map(option => option.value)

    expect(values[0]).toBe('system')
    expect(values).not.toContain('omarchy')
    expect(applyOptionSetting(config, 'theme', 'system').theme).toBe('system')
  })

  test('the JSON editor shows a value as the config file holds it', () => {
    const rules = { ...config, projects: [{ path: '/home/tester/api', sessionName: 'api' }] }

    expect(JSON.parse(getSettingEditorValue(rules, 'projects'))).toEqual([
      { path: '/home/tester/api', session_name: 'api' },
    ])
  })

  test('JSON edits are checked like the config file before they apply', () => {
    function message(field: SettingsEntry['id'], text: string): string | undefined {
      const edit = editSetting(config, field, text, '/home/tester')

      return edit.kind === 'invalid' ? edit.message : undefined
    }

    expect(message('projects', '[\n  {"path": "~/a", "listed": tru}\n]')).toBe(
      'Line 2: not valid JSON (expected true, false or null)'
    )
    expect(message('projects', '[{"path": "~/a", "listed": "yes"}]')).toBe(
      '[0].listed must be true or false'
    )
    expect(message('projects', '[{}, {}]')).toBe('[0].path is required (and 1 more)')
    expect(message('projects', '{}')).toBe('The value must be a list of project objects')
    expect(message('hiddenSessions', '["tmp-*", ""]')).toBe('[1] must be a non-empty string')
    expect(message('icons', '{"tmux": 1}')).toBe('tmux must be text')

    const edit = editSetting(
      config,
      'projects',
      '[{"path": "~/a", "listed": true}]',
      '/home/tester'
    )

    expect(edit.kind === 'parsed' && edit.config.projects).toEqual([
      { path: '/home/tester/a', listed: true },
    ])
  })
})
