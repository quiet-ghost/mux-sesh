import { spawn } from 'bun'
import { join } from 'path'
import { mkdir, stat } from 'fs/promises'
import type { Config } from '../types'

interface GitHubRepoRef {
  owner: string
  repo: string
}

function isSafeGitHubPathSegment(value: string): boolean {
  return value.length > 0 && value !== '.' && value !== '..' && /^[A-Za-z0-9._-]+$/.test(value)
}

function stripGitSuffix(value: string): string {
  return value.endsWith('.git') ? value.slice(0, -4) : value
}

function parseGitHubRepo(input: string): GitHubRepoRef | null {
  const trimmed = input.trim()

  if (trimmed.startsWith('git@github.com:')) {
    const path = stripGitSuffix(trimmed.slice('git@github.com:'.length))
    const parts = path.split('/').filter(Boolean)
    if (parts.length !== 2 || !parts.every(isSafeGitHubPathSegment)) {
      return null
    }

    return { owner: parts[0], repo: parts[1] }
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
      return null
    }

    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length !== 2) {
      return null
    }

    const owner = parts[0]
    const repo = stripGitSuffix(parts[1])
    if (!isSafeGitHubPathSegment(owner) || !isSafeGitHubPathSegment(repo)) {
      return null
    }

    return { owner, repo }
  } catch {
    return null
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export function isGitHubURL(input: string): boolean {
  return parseGitHubRepo(input) !== null
}

export function extractRepoName(url: string): string {
  return parseGitHubRepo(url)?.repo ?? ''
}

export async function cloneGitHubRepo(url: string, config: Config): Promise<string> {
  const repoName = extractRepoName(url)
  if (!repoName) {
    throw new Error('Could not extract repository name from URL')
  }

  const reposDir = config.reposPath
  await mkdir(reposDir, { recursive: true })

  const targetDir = join(reposDir, repoName)

  try {
    const targetStat = await stat(targetDir)
    if (!targetStat.isDirectory()) {
      throw new Error(`Clone target exists but is not a directory: ${targetDir}`)
    }

    return targetDir
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error
    }
  }

  const proc = spawn(['git', 'clone', url, targetDir], { stderr: 'pipe' })
  const stderr = proc.stderr instanceof ReadableStream ? await new Response(proc.stderr).text() : ''
  await proc.exited

  if (proc.exitCode !== 0) {
    throw new Error(stderr.trim() || 'Failed to clone repository')
  }

  return targetDir
}
