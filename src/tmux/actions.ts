import { spawn } from 'bun'
import { sanitizeTmuxSessionName } from './helpers'

type SpawnOptions = Parameters<typeof spawn>[1]

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
  await runTmuxCommand(
    ['tmux', 'switch-client', '-t', sessionName],
    `Failed to switch to tmux session '${sessionName}'`
  )
}

async function runTmuxCommand(
  command: string[],
  errorMessage: string,
  options?: SpawnOptions
): Promise<void> {
  const proc = spawn(command, options)
  const stderrPromise =
    proc.stderr instanceof ReadableStream ? new Response(proc.stderr).text() : Promise.resolve('')
  await proc.exited
  const stderr = (await stderrPromise).trim()

  if (proc.exitCode !== 0) {
    throw new Error(stderr ? `${errorMessage}: ${stderr}` : errorMessage)
  }
}

async function openTmuxSession(sessionName: string): Promise<void> {
  if (process.env.TMUX) {
    await switchClient(sessionName)
    return
  }

  await runTmuxCommand(
    ['tmux', 'attach-session', '-t', sessionName],
    `Failed to attach tmux session '${sessionName}'`,
    {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    }
  )
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

    await runTmuxCommand(command, `Failed to create tmux session '${sessionName}'`, {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    return
  }

  if (!(await tmuxSessionExists(sessionName))) {
    await runTmuxCommand(
      ['tmux', 'new-session', '-d', '-s', sessionName, '-c', path],
      `Failed to create tmux session '${sessionName}'`
    )

    if (options.startupCommand) {
      await runTmuxCommand(
        ['tmux', 'send-keys', '-t', sessionName, options.startupCommand, 'Enter'],
        `Failed to run startup command for tmux session '${sessionName}'`
      )
    }
  }

  await openTmuxSession(sessionName)
}

export async function createNamedTmuxSession(name: string): Promise<void> {
  const sessionName = sanitizeTmuxSessionName(name)
  const insideTmux = !!process.env.TMUX

  if (!insideTmux && !(await isTmuxRunning())) {
    await runTmuxCommand(
      ['tmux', 'new-session', '-s', sessionName],
      `Failed to create tmux session '${sessionName}'`,
      {
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
      }
    )
    return
  }

  if (!(await tmuxSessionExists(sessionName))) {
    await runTmuxCommand(
      ['tmux', 'new-session', '-d', '-s', sessionName],
      `Failed to create tmux session '${sessionName}'`
    )
  }

  await openTmuxSession(sessionName)
}

export async function switchTmuxSession(name: string): Promise<void> {
  await openTmuxSession(name)
}

export async function killTmuxSession(name: string): Promise<void> {
  await runTmuxCommand(
    ['tmux', 'kill-session', '-t', name],
    `Failed to kill tmux session '${name}'`
  )
}

export async function renameTmuxSession(oldName: string, newName: string): Promise<void> {
  const sanitizedName = sanitizeTmuxSessionName(newName)
  await runTmuxCommand(
    ['tmux', 'rename-session', '-t', oldName, sanitizedName],
    `Failed to rename tmux session '${oldName}'`
  )
}
