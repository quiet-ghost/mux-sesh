import { spawn } from 'bun'
import type { Item, SessionDetails, WindowInfo } from '../types'

export async function listTmuxSessions(): Promise<Item[]> {
  const proc = spawn([
    'tmux',
    'list-sessions',
    '-F',
    '#{session_name}:#{session_attached}:#{session_windows}',
  ])

  const output = await new Response(proc.stdout).text()
  const lines = output.trim().split('\n').filter(Boolean)

  return lines
    .map(line => {
      const [name, attached, windows] = line.split(':')
      return {
        title: name,
        path: name,
        desc: '',
        isSession: true,
        isAttached: attached === '1',
        windowCount: windows,
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function createTmuxSession(name: string, path: string): Promise<void> {
  const sessionName = name.replace(/\./g, '_')
  const insideTmux = !!process.env.TMUX

  // Check if tmux is running
  const tmuxRunning = spawn(['pgrep', 'tmux'])
  await tmuxRunning.exited
  const isTmuxRunning = tmuxRunning.exitCode === 0

  if (!insideTmux && !isTmuxRunning) {
    // Not inside tmux and tmux not running - create new session and attach
    const proc = spawn(['tmux', 'new-session', '-s', sessionName, '-c', path], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await proc.exited
    return
  }

  // Check if session exists
  const hasSession = spawn(['tmux', 'has-session', `-t=${sessionName}`])
  await hasSession.exited

  if (hasSession.exitCode !== 0) {
    // Session doesn't exist, create it
    const createProc = spawn(['tmux', 'new-session', '-d', '-s', sessionName, '-c', path])
    await createProc.exited

    // Send nvim command
    const nvimProc = spawn([
      'tmux',
      'send-keys',
      '-t',
      sessionName,
      "nvim -c \"lua vim.defer_fn(function() if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end end, 100)\"",
      'Enter',
    ])
    await nvimProc.exited
  }

  // Switch to session
  const switchProc = spawn(['tmux', 'switch-client', '-t', sessionName])
  await switchProc.exited
}

export async function createNamedTmuxSession(name: string): Promise<void> {
  const sessionName = name.replace(/\./g, '_').replace(/ /g, '_')
  const insideTmux = !!process.env.TMUX

  // Check if tmux is running
  const tmuxRunning = spawn(['pgrep', 'tmux'])
  await tmuxRunning.exited
  const isTmuxRunning = tmuxRunning.exitCode === 0

  if (!insideTmux && !isTmuxRunning) {
    // Not inside tmux and tmux not running - create new session and attach
    const proc = spawn(['tmux', 'new-session', '-s', sessionName], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await proc.exited
    return
  }

  // Check if session exists
  const hasSession = spawn(['tmux', 'has-session', `-t=${sessionName}`])
  await hasSession.exited

  if (hasSession.exitCode !== 0) {
    // Session doesn't exist, create it
    const createProc = spawn(['tmux', 'new-session', '-d', '-s', sessionName])
    await createProc.exited
  }

  // Switch to session
  const switchProc = spawn(['tmux', 'switch-client', '-t', sessionName])
  await switchProc.exited
}

export async function switchTmuxSession(name: string): Promise<void> {
  const proc = spawn(['tmux', 'switch-client', '-t', name])
  await proc.exited
}

export async function killTmuxSession(name: string): Promise<void> {
  const proc = spawn(['tmux', 'kill-session', '-t', name])
  await proc.exited
}

export async function renameTmuxSession(oldName: string, newName: string): Promise<void> {
  const sanitizedName = newName.replace(/\./g, '_').replace(/ /g, '_')
  const proc = spawn(['tmux', 'rename-session', '-t', oldName, sanitizedName])
  await proc.exited
}

export async function getSessionDetails(sessionName: string): Promise<SessionDetails> {
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
    const [index, name] = line.split(': ')

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

    // Replace home directory with ~
    const displayPath = currentPath.replace(process.env.HOME || '', '~')

    windows.push({
      index,
      name,
      currentPath: displayPath,
      currentCommand: ['bash', 'zsh', 'fish'].includes(currentCommand) ? '' : currentCommand,
    })
  }

  return {
    name: sessionName,
    isAttached: attached === '1',
    windowCount,
    windows,
  }
}
