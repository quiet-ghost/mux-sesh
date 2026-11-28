import { describe, expect, test } from 'bun:test'
import * as Schema from 'effect/Schema'
import { getDefaultConfig, normalizeConfig, serializeConfig } from '../src/config'
import {
  applyEditorSetting,
  applyOptionSetting,
  getSettingEditorTitle,
  getSettingEditorValue,
  getSettingOptions,
  getSettingsEntries,
  getSettingValue,
  isOptionSetting,
  stepSetting,
} from '../src/settings'

const decodeJsonText = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))

describe('settings metadata', () => {
  const config = getDefaultConfig('/home/tester')

  test('builds settings entries from shared field definitions', () => {
    const entries = getSettingsEntries(config)

    expect(entries.map(entry => entry.id)).toEqual([
      'backend',
      'theme',
      'colorScheme',
      'keybindMode',
      'prefixKey',
      'sortOrder',
      'zoxideMode',
      'autoUpdate',
      'searchHistory',
      'dirLength',
      'reposPath',
      'editor',
      'startupCommand',
      'defaultPreviewCommand',
      'projectPaths',
      'hiddenSessions',
      'pinnedSessions',
      'icons',
      'projects',
      'wildcards',
    ])
  })

  test('resolves option settings and editor metadata from the same field definitions', () => {
    expect(isOptionSetting('theme')).toBe(true)
    expect(isOptionSetting('reposPath')).toBe(false)
    expect(getSettingEditorTitle('defaultPreviewCommand')).toBe('Default Preview Command')
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
    expect(getSettingsEntries(legacy).some(entry => entry.value === 'hx .')).toBe(true)
  })

  test('Name depth steps from 1 to 6 and previews the path segments it keeps', () => {
    expect(getSettingValue(config, 'dirLength')).toBe('1 · mux-sesh')

    const two = stepSetting(config, 'dirLength', 1)
    expect(two?.dirLength).toBe(2)
    expect(two && getSettingValue(two, 'dirLength')).toBe('2 · dev/mux-sesh')
    expect(two && stepSetting(two, 'dirLength', 1)?.dirLength).toBe(3)

    expect(stepSetting(config, 'dirLength', -1)).toBeUndefined()
    expect(stepSetting({ ...config, dirLength: 6 }, 'dirLength', 1)).toBeUndefined()
    expect(stepSetting({ ...config, dirLength: 6 }, 'dirLength', -1)?.dirLength).toBe(5)
  })

  test('only number settings step', () => {
    expect(stepSetting(config, 'reposPath', 1)).toBeUndefined()
    expect(stepSetting(config, 'theme', 1)).toBeUndefined()
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
})
