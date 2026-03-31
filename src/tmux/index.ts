import { spawn } from 'bun'
import type { Item, SessionDetails, WindowInfo } from '../types'

const SESSION_DETAILS_CACHE_TTL_MS = 4000
const sessionDetailsCache = new Map<string, { details: SessionDetails; expiresAt: number }>()

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

function formatPanePreview(output: string): string[] {
  return stripAnsi(output)
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)
    .slice(-8)
}

export interface CreateTmuxSessionOptions {
  startupCommand?: string
}

function sanitizeSessionName(name: string): string {
  return name.replace(/\./g, '_').replace(/ /g, '_')
}

async function readTmuxValue(args: string[], errorMessage: string): Promise<string> {
  const proc = spawn(args)
  const output = await new Response(proc.stdout).text()
  await proc.exited

  if (proc.exitCode !== 0) {
    throw new Error(errorMessage)
  }

  const value = output.trim()
  if (!value) {
    throw new Error(errorMessage)
  }

  return value
}

export async function listTmuxSessions(): Promise<Item[]> {
  const proc = spawn([
    'tmux',
    'list-sessions',
    '-F',
    '#{session_name}:#{session_attached}:#{session_windows}:#{session_created}:#{session_activity}',
  ])

  const output = await new Response(proc.stdout).text()
  const lines = output.trim().split('\n').filter(Boolean)

  const sessions = lines.map(line => {
    const [name, attached, windows, created, activity] = line.split(':')
    return {
      title: name,
      path: name,
      desc: '',
      isSession: true,
      itemKind: 'tmux' as const,
      isAttached: attached === '1',
      windowCount: windows,
      createdAt: parseInt(created, 10),
      lastActivity: parseInt(activity, 10),
    }
  })

  return sessions.sort((a, b) => a.title.localeCompare(b.title))
}

export async function createTmuxSession(
  name: string,
  path: string,
  options: CreateTmuxSessionOptions = {}
): Promise<void> {
  const sessionName = sanitizeSessionName(name)
  const insideTmux = !!process.env.TMUX

  // Check if tmux is running
  const tmuxRunning = spawn(['pgrep', 'tmux'])
  await tmuxRunning.exited
  const isTmuxRunning = tmuxRunning.exitCode === 0

  if (!insideTmux && !isTmuxRunning) {
    const command = ['tmux', 'new-session', '-s', sessionName, '-c', path]
    if (options.startupCommand) {
      command.push(options.startupCommand)
    }

    const proc = spawn(command, {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await proc.exited
    return
  }

  const hasSession = spawn(['tmux', 'has-session', `-t=${sessionName}`])
  await hasSession.exited

  if (hasSession.exitCode !== 0) {
    const createProc = spawn(['tmux', 'new-session', '-d', '-s', sessionName, '-c', path])
    await createProc.exited

    if (options.startupCommand) {
      const startupProc = spawn(['tmux', 'send-keys', '-t', sessionName, options.startupCommand, 'Enter'])
      await startupProc.exited
    }
  }

  const switchProc = spawn(['tmux', 'switch-client', '-t', sessionName])
  await switchProc.exited
}

export async function createNamedTmuxSession(name: string): Promise<void> {
  const sessionName = sanitizeSessionName(name)
  const insideTmux = !!process.env.TMUX

  const tmuxRunning = spawn(['pgrep', 'tmux'])
  await tmuxRunning.exited
  const isTmuxRunning = tmuxRunning.exitCode === 0

  if (!insideTmux && !isTmuxRunning) {
    const proc = spawn(['tmux', 'new-session', '-s', sessionName], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await proc.exited
    return
  }

  const hasSession = spawn(['tmux', 'has-session', `-t=${sessionName}`])
  await hasSession.exited

  if (hasSession.exitCode !== 0) {
    const createProc = spawn(['tmux', 'new-session', '-d', '-s', sessionName])
    await createProc.exited
  }

  const switchProc = spawn(['tmux', 'switch-client', '-t', sessionName])
  await switchProc.exited
}

export async function switchTmuxSession(name: string): Promise<void> {
  const proc = spawn(['tmux', 'switch-client', '-t', name])
  await proc.exited
}

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

export async function killTmuxSession(name: string): Promise<void> {
  const proc = spawn(['tmux', 'kill-session', '-t', name])
  await proc.exited
}

export async function renameTmuxSession(oldName: string, newName: string): Promise<void> {
  const sanitizedName = sanitizeSessionName(newName)
  const proc = spawn(['tmux', 'rename-session', '-t', oldName, sanitizedName])
  await proc.exited
}

export async function getSessionDetails(sessionName: string): Promise<SessionDetails> {
  const cached = sessionDetailsCache.get(sessionName)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.details
  }

  // Get session status
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

  // Get windows
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

    // Get current directory
    const dirProc = spawn([
      'tmux',
      'display-message',
      '-t',
      `${sessionName}:${index}`,
      '-p',
      '#{pane_current_path}',
    ])
    const currentPath = (await new Response(dirProc.stdout).text()).trim()

    // Get current command
    const cmdProc = spawn([
      'tmux',
      'display-message',
      '-t',
      `${sessionName}:${index}`,
      '-p',
      '#{pane_current_command}',
    ])
    const currentCommand = (await new Response(cmdProc.stdout).text()).trim()

    const displayPath = currentPath.replace(process.env.HOME || '', '~')

    windows.push({
      index,
      name,
      currentPath: displayPath,
      currentCommand: ['bash', 'zsh', 'fish'].includes(currentCommand) ? '' : currentCommand,
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
