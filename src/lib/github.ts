import { spawn } from 'bun'
import { join } from 'path'
import { mkdir, stat } from 'fs/promises'
import type { Config } from '../types'

export function isGitHubURL(input: string): boolean {
  const trimmed = input.trim()
  return (
    trimmed.startsWith('https://github.com/') ||
    trimmed.startsWith('git@github.com:')
  )
}

export function extractRepoName(url: string): string {
  const trimmed = url.trim()
  
  if (trimmed.startsWith('https://github.com/')) {
    const path = trimmed.replace('https://github.com/', '').replace('.git', '')
    const parts = path.split('/')
    if (parts.length >= 2) {
      return parts[1]
    }
  } else if (trimmed.startsWith('git@github.com:')) {
    const path = trimmed.replace('git@github.com:', '').replace('.git', '')
    const parts = path.split('/')
    if (parts.length >= 2) {
      return parts[1]
    }
  }
  
  return ''
}

export async function cloneGitHubRepo(url: string, config: Config): Promise<string> {
  const repoName = extractRepoName(url)
  if (!repoName) {
    throw new Error('Could not extract repository name from URL')
  }
  
  const reposDir = config.reposPath
  await mkdir(reposDir, { recursive: true })
  
  const targetDir = join(reposDir, repoName)
  
  // Check if directory already exists
  try {
    await stat(targetDir)
    // Directory exists, return it
    return targetDir
  } catch {
    // Directory doesn't exist, clone it
  }
  
  // Clone the repository
  const proc = spawn(['git', 'clone', url, targetDir])
  await proc.exited
  
  if (proc.exitCode !== 0) {
    throw new Error('Failed to clone repository')
  }
  
  return targetDir
}
