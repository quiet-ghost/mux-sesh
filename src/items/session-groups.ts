import { basename } from 'path'
import { getPathGroupLabel, getWorktreeProjectName } from '../util/path-display'

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
