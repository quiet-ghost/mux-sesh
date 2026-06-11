import { spawn } from 'bun'
import type { SessionDetails, WindowInfo } from '../types'
import { formatPanePreview, formatWindowCommand, readTmuxValue } from './helpers'
import { toHomeRelativePath } from '../util/path-display'

const SESSION_DETAILS_CACHE_TTL_MS = 4000
const sessionDetailsCache = new Map<string, { details: SessionDetails; expiresAt: number }>()

export async function getCurrentTmuxSessionName(): Promise<string> {
  return readTmuxValue(
    ['tmux', 'display-message', '-p', '#S'],
    'Failed to resolve the current tmux session name'
  )
}

export async function getTmuxSessionDirectory(sessionName: string): Promise<string> {
  return readTmuxValue(
    ['tmux', 'display-message', '-t', sessionName, '-p', '#{pane_current_path}'],
    `Failed to resolve tmux directory for session '${sessionName}'`
  )
}

export async function getSessionDetails(sessionName: string): Promise<SessionDetails> {
  const cached = sessionDetailsCache.get(sessionName)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.details
  }

  const statusOutput = await readTmuxValue(
    [
      'tmux',
      'list-sessions',
      '-F',
      '#{session_name}:#{session_attached}:#{session_windows}',
      '-f',
      `#{==:#{session_name},${sessionName}}`,
    ],
    `Failed to load tmux session details for '${sessionName}'`
  )
  const [, attached, windowCount] = statusOutput.trim().split(':')

  const windowsOutput = await readTmuxValue(
    [
      'tmux',
      'list-windows',
      '-t',
      sessionName,
      '-F',
      '#{window_index}\t#{window_name}\t#{pane_current_path}\t#{pane_current_command}\t#{window_active}',
    ],
    `Failed to load tmux windows for '${sessionName}'`
  )
  const windowLines = windowsOutput.trim().split('\n').filter(Boolean)

  const windows: WindowInfo[] = []
  let activeWindowIndex = ''

  for (const line of windowLines) {
    const [index = '', name = '', currentPath = '', currentCommand = '', active = '0'] =
      line.split('\t')

    if (active === '1') {
      activeWindowIndex = index
    }

    windows.push({
      index,
      name,
      currentPath: toHomeRelativePath(currentPath),
      currentCommand: formatWindowCommand(currentCommand),
    })
  }

  let panePreviewLines: string[] | undefined
  if (activeWindowIndex.length > 0) {
    const paneProc = spawn([
      'tmux',
      'capture-pane',
      '-p',
      '-t',
      `${sessionName}:${activeWindowIndex}`,
      '-S',
      '-16',
    ])
    const paneOutput = await new Response(paneProc.stdout).text()
    const formatted = formatPanePreview(paneOutput)
    panePreviewLines = formatted.length > 0 ? formatted : undefined
  }

  const details = {
    name: sessionName,
    isAttached: attached === '1',
    windowCount,
    windows,
    panePreviewLines,
  }

  sessionDetailsCache.set(sessionName, {
    details,
    expiresAt: Date.now() + SESSION_DETAILS_CACHE_TTL_MS,
  })

  return details
}
