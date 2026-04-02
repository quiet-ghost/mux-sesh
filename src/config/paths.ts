import { join } from 'path'

export function getHomeDir(): string {
  return process.env.HOME || '~'
}

export function getConfigDir(homeDir = getHomeDir()): string {
  return process.env.XDG_CONFIG_HOME || join(homeDir, '.config')
}

export function getConfigPath(homeDir = getHomeDir()): string {
  return join(getConfigDir(homeDir), 'mux-sesh', 'config.json')
}
