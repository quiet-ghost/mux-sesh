import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { Config } from '../types'
import { getConfigPath, getHomeDir } from './paths'
import { getDefaultConfig, normalizeConfig, serializeConfig } from './index'

export async function loadConfig(): Promise<Config> {
  const homeDir = getHomeDir()
  const configPath = getConfigPath(homeDir)
  const file = Bun.file(configPath)

  if (!(await file.exists())) {
    const defaultConfig = getDefaultConfig(homeDir)
    await saveConfig(defaultConfig, homeDir)
    return defaultConfig
  }

  try {
    return normalizeConfig(await file.json(), homeDir)
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : ''
    throw new Error(
      `Failed to parse mux-sesh config at ${configPath}. Fix the JSON or move the file aside; existing config was not overwritten.${detail}`
    )
  }
}

export async function saveConfig(config: Config, homeDir = getHomeDir()): Promise<void> {
  const configPath = getConfigPath(homeDir)

  await mkdir(dirname(configPath), { recursive: true })
  await Bun.write(configPath, JSON.stringify(serializeConfig(config), null, 2))
}
