import { readdir, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { spawn } from 'bun'
import type { Config } from '../types'
import type { WorkspaceDetails, WorkspaceRef } from '../multiplexer'
import { stripAnsi } from '../util/ansi'
import { getGitRoot, resolveProjectSession } from '../config/session-rules'
import { resolveFileSession } from '../files/target'
import { toHomeRelativePath } from '../util/path-display'
import { quoteShellArg } from '../util/shell'

const MAX_PREVIEW_LINES = 24
const MAX_PREVIEW_LINE_LENGTH = 120
const PREVIEW_COMMAND_TIMEOUT_MS = 1500
const PROJECT_PREVIEW_CACHE_TTL_MS = 4000
const projectPreviewCache = new Map<string, { preview: ProjectPreview; expiresAt: number }>()

export interface ProjectPreview {
  path: string
  sessionName: string
  source: 'project' | 'wildcard' | 'default' | 'file'
  startupCommand?: string
  previewCommand?: string
  gitRoot?: string
  gitBranch?: string
  linkedSession?: WorkspaceDetails
  previewKind: 'command' | 'directory' | 'file'
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

export function interpolatePreviewCommand(
  command: string | undefined,
  projectPath: string
): string | undefined {
  if (!command) {
    return undefined
  }

  return command.replaceAll('{}', quoteShellArg(projectPath))
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
  linkedWorkspace?: WorkspaceRef,
  loadWorkspaceDetails?: (workspace: WorkspaceRef) => Promise<WorkspaceDetails>
): Promise<ProjectPreview> {
  const cacheKey = `${projectPath}::${linkedWorkspace ? `${linkedWorkspace.backend}:${linkedWorkspace.id}` : ''}`
  const cached = projectPreviewCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.preview
  }

  const [resolvedSession, gitRootPath, gitBranch, linkedSession] = await Promise.all([
    resolveProjectSession(projectPath, config),
    getGitRoot(projectPath),
    getGitBranch(projectPath),
    linkedWorkspace && loadWorkspaceDetails
      ? loadWorkspaceDetails(linkedWorkspace).catch(() => null)
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
      path: toHomeRelativePath(projectPath),
      sessionName: resolvedSession.sessionName,
      source: resolvedSession.source,
      startupCommand: resolvedSession.startupCommand,
      previewCommand: resolvedPreviewCommand,
      gitRoot: gitRootPath ? toHomeRelativePath(gitRootPath) : undefined,
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
    path: toHomeRelativePath(projectPath),
    sessionName: resolvedSession.sessionName,
    source: resolvedSession.source,
    startupCommand: resolvedSession.startupCommand,
    previewCommand: resolvedPreviewCommand,
    gitRoot: gitRootPath ? toHomeRelativePath(gitRootPath) : undefined,
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

const FILE_PREVIEW_MAX_BYTES = 16 * 1024

async function getFilePreviewLines(
  filePath: string
): Promise<{ lines: string[]; notice?: string }> {
  try {
    const fileInfo = await stat(filePath)
    const bytes = new Uint8Array(
      await Bun.file(filePath).slice(0, FILE_PREVIEW_MAX_BYTES).arrayBuffer()
    )

    if (bytes.includes(0)) {
      return {
        lines: [`${basename(filePath)} (${fileInfo.size} bytes)`],
        notice: 'Binary file; preview skipped.',
      }
    }

    const formatted = formatPreviewOutput(new TextDecoder().decode(bytes))
    return {
      lines: formatted.lines.length > 0 ? formatted.lines : ['(empty file)'],
      notice:
        formatted.truncated || fileInfo.size > FILE_PREVIEW_MAX_BYTES
          ? 'File preview truncated to fit the panel.'
          : undefined,
    }
  } catch {
    return {
      lines: [basename(filePath)],
      notice: 'Unable to read file contents.',
    }
  }
}

export async function getFilePreview(
  filePath: string,
  config: Config,
  linkedWorkspace?: WorkspaceRef,
  loadWorkspaceDetails?: (workspace: WorkspaceRef) => Promise<WorkspaceDetails>
): Promise<ProjectPreview> {
  const cacheKey = `file::${filePath}::${linkedWorkspace ? `${linkedWorkspace.backend}:${linkedWorkspace.id}` : ''}`
  const cached = projectPreviewCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.preview
  }

  const parentDirectory = dirname(filePath)
  const resolvedSession = resolveFileSession(filePath, config)
  const [gitRootPath, gitBranch, linkedSession, fileLines] = await Promise.all([
    getGitRoot(parentDirectory),
    getGitBranch(parentDirectory),
    linkedWorkspace && loadWorkspaceDetails
      ? loadWorkspaceDetails(linkedWorkspace).catch(() => null)
      : Promise.resolve(null),
    getFilePreviewLines(filePath),
  ])

  const preview: ProjectPreview = {
    path: toHomeRelativePath(filePath),
    sessionName: resolvedSession.sessionName,
    source: 'file',
    startupCommand: resolvedSession.startupCommand,
    gitRoot: gitRootPath ? toHomeRelativePath(gitRootPath) : undefined,
    gitBranch,
    linkedSession: linkedSession ?? undefined,
    previewKind: 'file',
    previewLabel: 'File Preview',
    previewLines: fileLines.lines,
    previewNotice: fileLines.notice,
  }

  projectPreviewCache.set(cacheKey, {
    preview,
    expiresAt: Date.now() + PROJECT_PREVIEW_CACHE_TTL_MS,
  })

  return preview
}
