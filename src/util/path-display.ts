import { basename, dirname } from 'path'
import { truncateMiddle } from './truncate'

export function toHomeRelativePath(path: string): string {
  const homeDir = process.env.HOME || ''

  if (!path) {
    return ''
  }

  if (homeDir && path === homeDir) {
    return '~'
  }

  if (homeDir && path.startsWith(`${homeDir}/`)) {
    return `~${path.slice(homeDir.length)}`
  }

  return path
}

// A path as shown in a fixed width: home as `~`, then its start and end kept.
export function fitPath(path: string, width: number): string {
  return truncateMiddle(toHomeRelativePath(path), width)
}

export function getWorktreeProjectName(path: string): string | null {
  if (!path) {
    return null
  }

  const parentPath = dirname(path)

  if (basename(parentPath) !== '.worktrees') {
    return null
  }

  const projectName = basename(dirname(parentPath))

  return projectName && projectName !== '.' && projectName !== '/' ? projectName : null
}

export function getPathGroupLabel(path: string): string {
  if (!path) {
    return ''
  }

  const parentPath = dirname(path)

  if ((process.env.HOME || '') && parentPath === (process.env.HOME || '')) {
    return '~'
  }

  const worktreeProject = getWorktreeProjectName(path)

  if (worktreeProject) {
    return worktreeProject
  }

  const parentName = basename(parentPath)

  if (!parentName || parentName === '.' || parentName === '/') {
    return ''
  }

  return parentName
}

export function getPathContextLabel(path: string): string {
  if (!path) {
    return ''
  }

  const parentPath = dirname(path)

  if (!parentPath || parentPath === '.' || parentPath === '/') {
    return parentPath === '/' ? '/' : ''
  }

  const worktreeProject = getWorktreeProjectName(path)

  if (worktreeProject) {
    return `${toHomeRelativePath(dirname(parentPath))} [worktree]`
  }

  return toHomeRelativePath(parentPath)
}
