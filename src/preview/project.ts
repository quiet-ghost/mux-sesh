import { readdir } from 'fs/promises'
import { basename, join } from 'path'
import { spawn } from 'bun'
import { getSessionDetails } from '../tmux'
import type { Config, SessionDetails } from '../types'
import { getGitRoot, resolveProjectSession } from '../config/session-rules'

const MAX_PREVIEW_LINES = 24
const MAX_PREVIEW_LINE_LENGTH = 120
const PREVIEW_COMMAND_TIMEOUT_MS = 1500
const PROJECT_PREVIEW_CACHE_TTL_MS = 4000
const projectPreviewCache = new Map<string, { preview: ProjectPreview; expiresAt: number }>()

export interface ProjectPreview {
  path: string
  sessionName: string
  source: 'project' | 'wildcard' | 'default'
  startupCommand?: string
  previewCommand?: string
  gitRoot?: string
  gitBranch?: string
  linkedSession?: SessionDetails
  previewKind: 'command' | 'directory'
  previewLabel: string
  previewLines: string[]
  previewNotice?: string
}

interface FormattedPreviewOutput {
  lines: string[]
  truncated: boolean
}

interface PackageSummary {
  name?: string
  scripts: string[]
}

function displayPath(path: string): string {
  return path.replace(process.env.HOME || '', '~')
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

export function interpolatePreviewCommand(
  command: string | undefined,
  projectPath: string
): string | undefined {
  if (!command) {
    return undefined
  }

  return command.replaceAll('{}', projectPath)
}

export function formatPreviewOutput(
  output: string,
  maxLines = MAX_PREVIEW_LINES
): FormattedPreviewOutput {
  const cleanedLines = stripAnsi(output)
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)
    .map(line =>
      line.length > MAX_PREVIEW_LINE_LENGTH
        ? `${line.slice(0, MAX_PREVIEW_LINE_LENGTH - 1)}…`
        : line
    )

  if (cleanedLines.length === 0) {
    return {
      lines: [],
      truncated: false,
    }
  }

  const truncated = cleanedLines.length > maxLines

  return {
    lines: truncated ? cleanedLines.slice(0, maxLines) : cleanedLines,
    truncated,
  }
}

async function getGitBranch(projectPath: string): Promise<string | undefined> {
  try {
    const proc = spawn(['git', '-C', projectPath, 'branch', '--show-current'], {
      stderr: 'pipe',
    })
    const output = (await new Response(proc.stdout).text()).trim()
    await proc.exited

    if (proc.exitCode !== 0 || output.length === 0) {
      return undefined
    }

    return output
  } catch {
    return undefined
  }
}

async function readPackageSummary(projectPath: string): Promise<PackageSummary | null> {
  try {
    const packageJson = (await Bun.file(join(projectPath, 'package.json')).json()) as {
      name?: string
      scripts?: Record<string, string>
    }

    return {
      name: packageJson.name,
      scripts: Object.keys(packageJson.scripts ?? {}).slice(0, 6),
    }
  } catch {
    return null
  }
}

async function getDirectoryPreviewLines(projectPath: string): Promise<string[]> {
  try {
    const [entries, packageSummary] = await Promise.all([
      readdir(projectPath, { withFileTypes: true }),
      readPackageSummary(projectPath),
    ])

    const visibleEntries = entries
      .filter(entry => !entry.name.startsWith('.'))
      .sort(
        (left, right) =>
          Number(right.isDirectory()) - Number(left.isDirectory()) ||
          left.name.localeCompare(right.name)
      )
      .slice(0, 16)

    const lines: string[] = []

    if (packageSummary?.name) {
      lines.push(`package  ${packageSummary.name}`)
    }

    if (packageSummary && packageSummary.scripts.length > 0) {
      lines.push(`scripts  ${packageSummary.scripts.join(', ')}`)
    }

    if (lines.length > 0) {
      lines.push('')
    }

    for (const entry of visibleEntries) {
      lines.push(entry.isDirectory() ? `${entry.name}/` : entry.name)
    }

    if (lines.length === 0) {
      lines.push(basename(projectPath))
    }

    return lines
  } catch {
    return [basename(projectPath)]
  }
}

async function runPreviewCommand(
  command: string,
  cwd: string
): Promise<{ output?: string; notice?: string }> {
  try {
    const proc = spawn(['sh', '-lc', command], {
      cwd,
      stderr: 'pipe',
    })

    const stdoutPromise = new Response(proc.stdout).text()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      proc.kill()
    }, PREVIEW_COMMAND_TIMEOUT_MS)

    await proc.exited
    clearTimeout(timeout)

    if (timedOut) {
      return { notice: 'Preview command timed out; showing directory listing instead.' }
    }

    const output = await stdoutPromise
    if (proc.exitCode !== 0) {
      return { notice: 'Preview command failed; showing directory listing instead.' }
    }

    return { output }
  } catch {
    return { notice: 'Preview command failed; showing directory listing instead.' }
  }
}

export async function getProjectPreview(
  projectPath: string,
  config: Config,
  linkedSessionName?: string
): Promise<ProjectPreview> {
  const cacheKey = `${projectPath}::${linkedSessionName ?? ''}`
  const cached = projectPreviewCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.preview
  }

  const [resolvedSession, gitRootPath, gitBranch, linkedSession] = await Promise.all([
    resolveProjectSession(projectPath, config),
    getGitRoot(projectPath),
    getGitBranch(projectPath),
    linkedSessionName
      ? getSessionDetails(linkedSessionName).catch(() => null)
      : Promise.resolve(null),
  ])

  const resolvedPreviewCommand = interpolatePreviewCommand(
    resolvedSession.previewCommand,
    projectPath
  )
  const commandResult = resolvedPreviewCommand
    ? await runPreviewCommand(resolvedPreviewCommand, projectPath)
    : undefined
  const formattedCommandOutput = commandResult?.output
    ? formatPreviewOutput(commandResult.output)
    : undefined

  if (formattedCommandOutput && formattedCommandOutput.lines.length > 0) {
    const preview: ProjectPreview = {
      path: displayPath(projectPath),
      sessionName: resolvedSession.sessionName,
      source: resolvedSession.source,
      startupCommand: resolvedSession.startupCommand,
      previewCommand: resolvedPreviewCommand,
      gitRoot: gitRootPath ? displayPath(gitRootPath) : undefined,
      gitBranch,
      linkedSession: linkedSession ?? undefined,
      previewKind: 'command',
      previewLabel: 'Preview Output',
      previewLines: formattedCommandOutput.lines,
      previewNotice: formattedCommandOutput.truncated
        ? 'Preview output truncated to fit the panel.'
        : undefined,
    }

    projectPreviewCache.set(cacheKey, {
      preview,
      expiresAt: Date.now() + PROJECT_PREVIEW_CACHE_TTL_MS,
    })

    return preview
  }

  const fallbackLines = await getDirectoryPreviewLines(projectPath)
  const formattedDirectoryOutput = formatPreviewOutput(fallbackLines.join('\n'))

  const preview: ProjectPreview = {
    path: displayPath(projectPath),
    sessionName: resolvedSession.sessionName,
    source: resolvedSession.source,
    startupCommand: resolvedSession.startupCommand,
    previewCommand: resolvedPreviewCommand,
    gitRoot: gitRootPath ? displayPath(gitRootPath) : undefined,
    gitBranch,
    linkedSession: linkedSession ?? undefined,
    previewKind: 'directory',
    previewLabel: 'Directory Listing',
    previewLines: formattedDirectoryOutput.lines,
    previewNotice:
      commandResult?.notice ??
      (formattedDirectoryOutput.truncated
        ? 'Directory listing truncated to fit the panel.'
        : undefined),
  }

  projectPreviewCache.set(cacheKey, {
    preview,
    expiresAt: Date.now() + PROJECT_PREVIEW_CACHE_TTL_MS,
  })

  return preview
}
