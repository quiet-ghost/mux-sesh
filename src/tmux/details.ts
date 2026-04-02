import { spawn } from 'bun'
import type { SessionDetails, WindowInfo } from '../types'
import { formatPanePreview, formatWindowCommand, readTmuxValue } from './helpers'

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

  const statusProc = spawn([
    'tmux',
    'list-sessions',
    '-F',
    '#{session_name}:#{session_attached}:#{session_windows}',
    '-f',
    `#{==:#{session_name},${sessionName}}`,
  ])
  const statusOutput = await new Response(statusProc.stdout).text()
  const [, attached, windowCount] = statusOutput.trim().split(':')

  const windowsProc = spawn([
    'tmux',
    'list-windows',
    '-t',
    sessionName,
    '-F',
    '#{window_index}:#{window_name}',
  ])
  const windowsOutput = await new Response(windowsProc.stdout).text()
  const windowLines = windowsOutput.trim().split('\n').filter(Boolean)

  const windows: WindowInfo[] = []

  for (const line of windowLines) {
    const [index, name] = line.split(':')

    const dirProc = spawn([
      'tmux',
      'display-message',
      '-t',
      `${sessionName}:${index}`,
      '-p',
      '#{pane_current_path}',
    ])
    const currentPath = (await new Response(dirProc.stdout).text()).trim()

    const cmdProc = spawn([
      'tmux',
      'display-message',
      '-t',
      `${sessionName}:${index}`,
      '-p',
      '#{pane_current_command}',
    ])
    const currentCommand = (await new Response(cmdProc.stdout).text()).trim()

    windows.push({
      index,
      name,
      currentPath: currentPath.replace(process.env.HOME || '', '~'),
      currentCommand: formatWindowCommand(currentCommand),
    })
  }

  const activeWindowProc = spawn([
    'tmux',
    'display-message',
    '-t',
    sessionName,
    '-p',
    '#{window_index}',
  ])
  const activeWindowIndex = (await new Response(activeWindowProc.stdout).text()).trim()

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
