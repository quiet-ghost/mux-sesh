import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { Config } from '../types'
import { getConfigPath, getHomeDir } from './paths'
import { getDefaultConfig, normalizeConfig, serializeConfig } from './index'

export async function loadConfig(): Promise<Config> {
  const homeDir = getHomeDir()
  const configPath = getConfigPath(homeDir)

  try {
    const file = Bun.file(configPath)
    return normalizeConfig(await file.json(), homeDir)
  } catch {
    const defaultConfig = getDefaultConfig(homeDir)
    await saveConfig(defaultConfig, homeDir)
    return defaultConfig
  }
}

export async function saveConfig(config: Config, homeDir = getHomeDir()): Promise<void> {
  const configPath = getConfigPath(homeDir)

  await mkdir(dirname(configPath), { recursive: true })
  await Bun.write(configPath, JSON.stringify(serializeConfig(config), null, 2))
}
