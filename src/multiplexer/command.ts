import { spawn } from 'bun'

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface CommandOptions {
  inheritStdio?: boolean
}

export interface CommandRunner {
  run(command: readonly string[], options?: CommandOptions): Promise<CommandResult>
}

async function readStream(stream: unknown): Promise<string> {
  return stream instanceof ReadableStream ? new Response(stream).text() : ''
}

export function createCommandRunner(): CommandRunner {
  return {
    async run(command, options = {}): Promise<CommandResult> {
      try {
        const proc = spawn(
          [...command],
          options.inheritStdio
            ? { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' }
            : { stdout: 'pipe', stderr: 'pipe' }
        )
        const stdoutPromise = readStream(proc.stdout)
        const stderrPromise = readStream(proc.stderr)
        await proc.exited
        return {
          exitCode: proc.exitCode ?? 1,
          stdout: await stdoutPromise,
          stderr: await stderrPromise,
        }
      } catch (error) {
        return {
          exitCode: 127,
          stdout: '',
          stderr: error instanceof Error ? error.message : 'Unable to start command',
        }
      }
    },
  }
}
