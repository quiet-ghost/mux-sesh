import { basename, dirname } from 'path'

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

function getWorktreeProjectName(path: string): string | null {
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

export function getLiveSessionGroupLabel(path: string): string {
  const worktreeProject = getWorktreeProjectName(path)

  if (worktreeProject) {
    return `${worktreeProject} [worktree]`
  }

  return getPathGroupLabel(path)
}

export function getLiveSessionSortKey(path: string, title: string): string {
  const worktreeProject = getWorktreeProjectName(path)

  if (worktreeProject) {
    return worktreeProject
  }

  const baseName = basename(path)
  return baseName && baseName !== '.' && baseName !== '/' ? baseName : title
}
