import { spawn } from 'bun'
import { sanitizeTmuxSessionName } from './helpers'

export interface CreateTmuxSessionOptions {
  startupCommand?: string
}

async function isTmuxRunning(): Promise<boolean> {
  const proc = spawn(['pgrep', 'tmux'])
  await proc.exited
  return proc.exitCode === 0
}

async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  const proc = spawn(['tmux', 'has-session', `-t=${sessionName}`])
  await proc.exited
  return proc.exitCode === 0
}

async function switchClient(sessionName: string): Promise<void> {
  const proc = spawn(['tmux', 'switch-client', '-t', sessionName])
  await proc.exited
}

export async function createTmuxSession(
  name: string,
  path: string,
  options: CreateTmuxSessionOptions = {}
): Promise<void> {
  const sessionName = sanitizeTmuxSessionName(name)
  const insideTmux = !!process.env.TMUX

  if (!insideTmux && !(await isTmuxRunning())) {
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

  if (!(await tmuxSessionExists(sessionName))) {
    const createProc = spawn(['tmux', 'new-session', '-d', '-s', sessionName, '-c', path])
    await createProc.exited

    if (options.startupCommand) {
      const startupProc = spawn([
        'tmux',
        'send-keys',
        '-t',
        sessionName,
        options.startupCommand,
        'Enter',
      ])
      await startupProc.exited
    }
  }

  await switchClient(sessionName)
}

export async function createNamedTmuxSession(name: string): Promise<void> {
  const sessionName = sanitizeTmuxSessionName(name)
  const insideTmux = !!process.env.TMUX

  if (!insideTmux && !(await isTmuxRunning())) {
    const proc = spawn(['tmux', 'new-session', '-s', sessionName], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await proc.exited
    return
  }

  if (!(await tmuxSessionExists(sessionName))) {
    const createProc = spawn(['tmux', 'new-session', '-d', '-s', sessionName])
    await createProc.exited
  }

  await switchClient(sessionName)
}

export async function switchTmuxSession(name: string): Promise<void> {
  await switchClient(name)
}

export async function killTmuxSession(name: string): Promise<void> {
  const proc = spawn(['tmux', 'kill-session', '-t', name])
  await proc.exited
}

export async function renameTmuxSession(oldName: string, newName: string): Promise<void> {
  const sanitizedName = sanitizeTmuxSessionName(newName)
  const proc = spawn(['tmux', 'rename-session', '-t', oldName, sanitizedName])
  await proc.exited
}
