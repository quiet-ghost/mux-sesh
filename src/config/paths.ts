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

function getStateDir(homeDir = getHomeDir()): string {
  return process.env.XDG_STATE_HOME || join(homeDir, '.local', 'state')
}

// What the picker opened, for search ranking; local only, safe to delete.
export function getOpenHistoryPath(homeDir = getHomeDir()): string {
  return join(getStateDir(homeDir), 'mux-sesh', 'frecency.jsonl')
}
