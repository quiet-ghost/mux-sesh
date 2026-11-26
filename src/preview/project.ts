import { readdir, stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { Option, Schema } from 'effect'
import type { Config } from '../types'
import type { WorkspaceDetails, WorkspaceRef } from '../multiplexer'
import {
  CommandInterrupted,
  CommandOutputLimitError,
  CommandTimeoutError,
  DEFAULT_COMMAND_POLICY,
  type CommandPolicy,
  type CommandRunner,
} from '../multiplexer/command'
import { stripAnsi } from '../util/ansi'
import { resolveProjectSession } from '../config/session-rules'
import { resolveFileSession } from '../files/target'
import { toHomeRelativePath } from '../util/path-display'
import { quoteShellArg } from '../util/shell'

const MAX_PREVIEW_LINES = 24
const MAX_PREVIEW_LINE_LENGTH = 120

// Preview and git reads are display-only: a short deadline and a small output budget.
export const PREVIEW_COMMAND_POLICY: CommandPolicy = {
  ...DEFAULT_COMMAND_POLICY,
  timeoutMs: 1500,
  maxStdoutBytes: 256 * 1024,
}

export interface PreviewServices {
  readonly runner: CommandRunner
  readonly signal?: AbortSignal
  readonly loadWorkspaceDetails?: (workspace: WorkspaceRef) => Promise<WorkspaceDetails>
}

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

const decodePackageManifest = Schema.decodeUnknownOption(
  Schema.Struct({
    name: Schema.optionalKey(Schema.Unknown),
    scripts: Schema.optionalKey(Schema.Unknown),
  })
)

const isPackageName = Schema.is(Schema.String)
const isScriptTable = Schema.is(Schema.Record(Schema.String, Schema.Unknown))

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

async function gitOutput(
  args: readonly string[],
  services: PreviewServices
): Promise<string | undefined> {
  try {
    const result = await services.runner.run(['git', ...args], { signal: services.signal })
    const output = result.stdout.trim()

    return result.exitCode === 0 && output.length > 0 ? output : undefined
  } catch (cause) {
    // Git context is optional; only cancellation propagates.
    if (cause instanceof CommandInterrupted) throw cause

    return undefined
  }
}

function getGitBranch(projectPath: string, services: PreviewServices): Promise<string | undefined> {
  return gitOutput(['-C', projectPath, 'branch', '--show-current'], services)
}

function getGitRoot(projectPath: string, services: PreviewServices): Promise<string | undefined> {
  return gitOutput(['-C', projectPath, 'rev-parse', '--show-toplevel'], services)
}

async function loadLinkedSession(
  linkedWorkspace: WorkspaceRef | undefined,
  services: PreviewServices
): Promise<WorkspaceDetails | undefined> {
  if (!linkedWorkspace || !services.loadWorkspaceDetails) return undefined

  try {
    return await services.loadWorkspaceDetails(linkedWorkspace)
  } catch (cause) {
    // The project preview stands without its linked session; only cancellation propagates.
    if (cause instanceof CommandInterrupted) throw cause

    return undefined
  }
}

async function readPackageSummary(projectPath: string): Promise<PackageSummary | null> {
  try {
    const packageJson: unknown = await Bun.file(join(projectPath, 'package.json')).json()
    const manifest = decodePackageManifest(packageJson)

    if (Option.isNone(manifest)) {
      return null
    }

    const { name, scripts } = manifest.value

    return {
      name: isPackageName(name) ? name : undefined,
      scripts: isScriptTable(scripts) ? Object.keys(scripts).slice(0, 6) : [],
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

function previewFailureNotice(cause: unknown): string {
  if (cause instanceof CommandTimeoutError) {
    return 'Preview command timed out; showing directory listing instead.'
  }

  if (cause instanceof CommandOutputLimitError) {
    return 'Preview command wrote too much output; showing directory listing instead.'
  }

  return 'Preview command failed; showing directory listing instead.'
}

async function runPreviewCommand(
  command: string,
  cwd: string,
  services: PreviewServices
): Promise<{ output?: string; notice?: string }> {
  try {
    const result = await services.runner.run(['sh', '-lc', command], {
      cwd,
      signal: services.signal,
    })

    if (result.exitCode !== 0) {
      return { notice: 'Preview command failed; showing directory listing instead.' }
    }

    return { output: result.stdout }
  } catch (cause) {
    if (cause instanceof CommandInterrupted) throw cause

    return { notice: previewFailureNotice(cause) }
  }
}

// Uncached: every call reads again, so changed rules and refreshes show current output.
export async function getProjectPreview(
  projectPath: string,
  config: Config,
  linkedWorkspace: WorkspaceRef | undefined,
  services: PreviewServices
): Promise<ProjectPreview> {
  const [resolvedSession, gitRootPath, gitBranch, linkedSession] = await Promise.all([
    resolveProjectSession(projectPath, config),
    getGitRoot(projectPath, services),
    getGitBranch(projectPath, services),
    loadLinkedSession(linkedWorkspace, services),
  ])

  const resolvedPreviewCommand = interpolatePreviewCommand(
    resolvedSession.previewCommand,
    projectPath
  )

  const commandResult = resolvedPreviewCommand
    ? await runPreviewCommand(resolvedPreviewCommand, projectPath, services)
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
      linkedSession,
      previewKind: 'command',
      previewLabel: 'Preview Output',
      previewLines: formattedCommandOutput.lines,
      previewNotice: formattedCommandOutput.truncated
        ? 'Preview output truncated to fit the panel.'
        : undefined,
    }

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
    linkedSession,
    previewKind: 'directory',
    previewLabel: 'Directory Listing',
    previewLines: formattedDirectoryOutput.lines,
    previewNotice:
      commandResult?.notice ??
      (formattedDirectoryOutput.truncated
        ? 'Directory listing truncated to fit the panel.'
        : undefined),
  }

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
  linkedWorkspace: WorkspaceRef | undefined,
  services: PreviewServices
): Promise<ProjectPreview> {
  const parentDirectory = dirname(filePath)
  const resolvedSession = resolveFileSession(filePath, config)

  const [gitRootPath, gitBranch, linkedSession, fileLines] = await Promise.all([
    getGitRoot(parentDirectory, services),
    getGitBranch(parentDirectory, services),
    loadLinkedSession(linkedWorkspace, services),
    getFilePreviewLines(filePath),
  ])

  const preview: ProjectPreview = {
    path: toHomeRelativePath(filePath),
    sessionName: resolvedSession.sessionName,
    source: 'file',
    startupCommand: resolvedSession.startupCommand,
    gitRoot: gitRootPath ? toHomeRelativePath(gitRootPath) : undefined,
    gitBranch,
    linkedSession,
    previewKind: 'file',
    previewLabel: 'File Preview',
    previewLines: fileLines.lines,
    previewNotice: fileLines.notice,
  }

  return preview
}
