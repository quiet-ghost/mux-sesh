import { describe, expect, test } from 'bun:test'
import { getDefaultConfig } from '../src/config'
import {
  applyEditorSetting,
  applyOptionSetting,
  getSettingEditorTitle,
  getSettingEditorValue,
  getSettingOptions,
  getSettingsEntries,
  isOptionSetting,
} from '../src/settings'

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
      'dirLength',
      'reposPath',
      'editor',
      'editorCmd',
      'defaultStartupCommand',
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

  test('sets and clears backend preference', () => {
    const herdrConfig = applyOptionSetting(config, 'backend', 'herdr')
    expect(herdrConfig.backend).toBe('herdr')
    expect(applyOptionSetting(herdrConfig, 'backend', 'auto').backend).toBeUndefined()
  })
})
