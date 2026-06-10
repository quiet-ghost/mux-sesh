import { basename, dirname, isAbsolute, join } from 'path'
import { stat } from 'fs/promises'
import type { Config, Item } from '../types'

export interface ResolvedFileSession {
  sessionName: string
  cwd: string
  startupCommand: string
}

export type TypedPathTarget = { kind: 'file' | 'directory'; path: string }

function quoteShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function sanitizeSessionName(value: string): string {
  return value.replace(/[.\s/]+/g, '_')
}

export function isFileItem(item: Pick<Item, 'itemKind'>): boolean {
  return item.itemKind === 'file'
}

export function expandUserPath(value: string, homeDir = process.env.HOME || ''): string {
  if (value === '~') {
    return homeDir || value
  }

  if (value.startsWith('~/') && homeDir) {
    return join(homeDir, value.slice(2))
  }

  return value
}

export function buildFileSessionName(filePath: string): string {
  const fileBase = basename(filePath)
  const parentBase = basename(dirname(filePath))
  const combined =
    parentBase && parentBase !== '.' && parentBase !== '/' ? `${parentBase}_${fileBase}` : fileBase

  return sanitizeSessionName(combined)
}

export function interpolateStartupCommand(command: string, filePath: string): string {
  return command
    .replaceAll('{file}', quoteShellArg(filePath))
    .replaceAll('{dir}', quoteShellArg(dirname(filePath)))
    .replaceAll('{}', quoteShellArg(filePath))
}

export function buildFileStartupCommand(filePath: string, config: Config): string {
  const configured = config.defaultSession?.startupCommand
  if (configured && /\{file\}|\{dir\}|\{\}/.test(configured)) {
    return interpolateStartupCommand(configured, filePath)
  }

  return `${config.editor} ${quoteShellArg(filePath)}`
}

export function resolveFileSession(filePath: string, config: Config): ResolvedFileSession {
  return {
    sessionName: buildFileSessionName(filePath),
    cwd: dirname(filePath),
    startupCommand: buildFileStartupCommand(filePath, config),
  }
}

export function looksLikePathInput(value: string): boolean {
  return value.startsWith('/') || value === '~' || value.startsWith('~/') || value.startsWith('./')
}

export async function resolveTypedPathTarget(
  searchTerm: string,
  homeDir = process.env.HOME || ''
): Promise<TypedPathTarget | null> {
  if (!looksLikePathInput(searchTerm)) {
    return null
  }

  const expanded = expandUserPath(searchTerm, homeDir)
  const absolute = isAbsolute(expanded) ? expanded : join(process.cwd(), expanded)

  try {
    const info = await stat(absolute)
    if (info.isFile()) {
      return { kind: 'file', path: absolute }
    }

    if (info.isDirectory()) {
      return { kind: 'directory', path: absolute }
    }

    return null
  } catch {
    return null
  }
}
