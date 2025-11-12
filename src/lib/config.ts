import { join } from 'path'
import { mkdir } from 'fs/promises'
import type { Config } from '../types'

export function getDefaultConfig(): Config {
  const homeDir = process.env.HOME || '~'
  return {
    projectPaths: [
      join(homeDir, 'dev'),
      join(homeDir, 'personal'),
    ],
    reposPath: join(homeDir, 'dev', 'repos'),
    editor: 'nvim',
    editorCmd: 'nvim -c "lua vim.defer_fn(function() if pcall(require, \'telescope\') then vim.cmd(\'Telescope find_files\') end end, 100)"',
  }
}

export async function loadConfig(): Promise<Config> {
  const configDir = join(process.env.HOME!, '.config', 'mux-sesh')
  const configPath = join(configDir, 'config.json')
  
  try {
    const file = Bun.file(configPath)
    const config = await file.json()
    return {
      ...getDefaultConfig(),
      ...config,
    }
  } catch (error) {
    // Config doesn't exist, create default
    const defaultConfig = getDefaultConfig()
    await saveConfig(defaultConfig)
    return defaultConfig
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const configDir = join(process.env.HOME!, '.config', 'mux-sesh')
  const configPath = join(configDir, 'config.json')
  
  await mkdir(configDir, { recursive: true })
  await Bun.write(configPath, JSON.stringify(config, null, 2))
}

export function getConfigPath(): string {
  return join(process.env.HOME!, '.config', 'mux-sesh', 'config.json')
}
