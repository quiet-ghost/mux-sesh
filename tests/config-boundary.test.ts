import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Schema } from 'effect'
import { getConfigPath, getDefaultConfig, loadConfig, saveConfig } from '../src/config'

let root = ''
let home = ''
const savedHome = process.env.HOME
const savedXdg = process.env.XDG_CONFIG_HOME

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mux-sesh-config-boundary-'))
  home = join(root, 'home')
  process.env.HOME = home
  delete process.env.XDG_CONFIG_HOME
  await mkdir(join(home, '.config', 'mux-sesh'), { recursive: true })
})

afterEach(async () => {
  process.env.HOME = savedHome

  if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = savedXdg

  await rm(root, { recursive: true, force: true })
})

async function writeConfig(document: Schema.JsonObject): Promise<string> {
  const text = JSON.stringify(document, null, 2)
  await writeFile(getConfigPath(home), text)

  return text
}

async function loadFailure(): Promise<Error> {
  try {
    await loadConfig()
  } catch (cause) {
    if (cause instanceof Error) return cause
  }

  throw new Error('Expected loadConfig to reject')
}

describe('config decoding at the file boundary', () => {
  test('invalid supplied fields are reported by path without echoing their values', async () => {
    const text = await writeConfig({
      backend: 'sk-fixture-secret-value',
      project_paths: ['~/dev', ''],
      projects: [{ session_name: 'no-path' }],
      dir_length: 0,
      themes: {
        broken: {
          light: {
            palette: {
              neutral: '#fff',
              primary: '#111',
              success: '#222',
              warning: '#333',
              error: '#444',
              info: '#555',
            },
          },
          dark: 'nope',
        },
      },
    })

    const failure = await loadFailure()

    expect(failure.message).toContain(getConfigPath(home))
    expect(failure.message).toContain('backend (expected "tmux" or "herdr")')
    expect(failure.message).toContain('project_paths[1] (expected a non-empty string)')
    expect(failure.message).toContain('projects[0].path (required)')
    expect(failure.message).toContain('dir_length (expected a whole number of at least 1)')
    expect(failure.message).toContain('themes.broken.light.palette.ink (required)')
    expect(failure.message).toContain('themes.broken.dark (expected a theme variant object)')
    expect(failure.message).toContain('The file was not changed.')
    expect(failure.message).not.toContain('sk-fixture-secret-value')
    expect(await readFile(getConfigPath(home), 'utf8')).toBe(text)
  })

  test('a JSON value that is not an object is invalid, not an empty config', async () => {
    await writeFile(getConfigPath(home), '["not", "an", "object"]')

    expect((await loadFailure()).message).toContain('expected a JSON object')
  })

  test('valid aliases, missing fields, and empty text keep their intentional defaults', async () => {
    await writeConfig({ keybindMode: 'standard', editor: '', project_paths: [] })

    const config = await loadConfig()
    const defaults = getDefaultConfig(home)

    expect(config.keybindMode).toBe('standard')
    expect(config.editor).toBe(defaults.editor)
    expect(config.projectPaths).toEqual(defaults.projectPaths)
  })
})

describe('config saving', () => {
  test('saving keeps unknown user fields and drops stale aliases it rewrites', async () => {
    await writeConfig({
      theme: 'gruvbox',
      themeName: 'legacy',
      future_option: { keep: true },
      keybindMode: 'vim',
    })

    const config = await loadConfig()
    await saveConfig({ ...config, keybindMode: 'standard' }, home)

    const saved: unknown = JSON.parse(await readFile(getConfigPath(home), 'utf8'))

    expect(saved).toMatchObject({
      keybind_mode: 'standard',
      future_option: { keep: true },
      themeName: 'legacy',
    })
    expect(saved).not.toHaveProperty('keybindMode')
  })

  test('saving refuses to replace a config file that became unreadable', async () => {
    const config = await loadConfig()
    await writeFile(getConfigPath(home), '{edited by hand and broken')

    let failure: Error | undefined

    try {
      await saveConfig({ ...config, keybindMode: 'standard' }, home)
    } catch (cause) {
      if (cause instanceof Error) failure = cause
    }

    expect(failure?.message).toContain('was not saved')
    expect(await readFile(getConfigPath(home), 'utf8')).toBe('{edited by hand and broken')
  })
})
