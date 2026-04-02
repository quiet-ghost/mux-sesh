import { basename } from 'path'
import { spawn } from 'bun'
import type { Config, ProjectProfile, ProjectWildcard } from '../types'
import { matchesGlob, normalizePathForMatching } from '../util/glob'

export interface ResolvedProjectSession {
  sessionName: string
  startupCommand?: string
  previewCommand?: string
  source: 'project' | 'wildcard' | 'default'
}

export interface ResolveProjectSessionOptions {
  getGitRoot?: (projectPath: string) => Promise<string | null>
}

function sanitizeSessionName(value: string): string {
  return value.replace(/[.\s/]+/g, '_')
}

function pathMatches(projectPath: string, pattern: string): boolean {
  return matchesGlob(normalizePathForMatching(projectPath), normalizePathForMatching(pattern), {
    pathSeparatorAware: true,
  })
}

function findProjectProfile(projectPath: string, config: Config): ProjectProfile | undefined {
  return config.projects?.find(profile => normalizePathForMatching(profile.path) === projectPath)
}

function findWildcard(projectPath: string, config: Config): ProjectWildcard | undefined {
  return config.wildcards?.find(wildcard => pathMatches(projectPath, wildcard.pattern))
}

export async function getGitRoot(projectPath: string): Promise<string | null> {
  try {
    const proc = spawn(['git', '-C', projectPath, 'rev-parse', '--show-toplevel'], {
      stderr: 'pipe',
    })
    const output = (await new Response(proc.stdout).text()).trim()
    await proc.exited

    if (proc.exitCode !== 0 || output.length === 0) {
      return null
    }

    return output
  } catch {
    return null
  }
}

function buildSessionName(projectPath: string, dirLength = 1): string {
  const namingPath = normalizePathForMatching(projectPath)
  const parts = namingPath.split('/').filter(Boolean)
  const segmentCount = Math.max(1, dirLength)
  const relevantParts = parts.slice(-segmentCount)
  const joined = relevantParts.length > 0 ? relevantParts.join('_') : basename(projectPath)

  return sanitizeSessionName(joined)
}

export async function resolveProjectSession(
  projectPath: string,
  config: Config,
  _options: ResolveProjectSessionOptions = {}
): Promise<ResolvedProjectSession> {
  const normalizedProjectPath = normalizePathForMatching(projectPath)
  const projectProfile = findProjectProfile(normalizedProjectPath, config)

  if (projectProfile) {
    return {
      sessionName: sanitizeSessionName(
        projectProfile.sessionName ?? buildSessionName(projectPath, config.dirLength)
      ),
      startupCommand: projectProfile.startupCommand ?? config.defaultSession?.startupCommand,
      previewCommand: projectProfile.previewCommand ?? config.defaultSession?.previewCommand,
      source: 'project',
    }
  }

  const wildcard = findWildcard(normalizedProjectPath, config)
  if (wildcard) {
    return {
      sessionName: sanitizeSessionName(
        wildcard.sessionName ?? buildSessionName(projectPath, config.dirLength)
      ),
      startupCommand: wildcard.startupCommand ?? config.defaultSession?.startupCommand,
      previewCommand: wildcard.previewCommand ?? config.defaultSession?.previewCommand,
      source: 'wildcard',
    }
  }

  return {
    sessionName: buildSessionName(projectPath, config.dirLength),
    startupCommand: config.defaultSession?.startupCommand,
    previewCommand: config.defaultSession?.previewCommand,
    source: 'default',
  }
}
