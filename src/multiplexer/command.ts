import { spawn } from 'bun'
import { Data, Option, Schema } from 'effect'

const missingExecutable = Schema.decodeUnknownOption(
  Schema.Struct({ code: Schema.Literal('ENOENT') })
)

export class CommandTransportError extends Data.TaggedError('CommandTransportError')<{
  readonly executable: string
  readonly phase: 'spawn' | 'read' | 'wait'
  readonly cause: unknown
}> {
  static isNotFound(cause: unknown): cause is CommandTransportError {
    return (
      cause instanceof CommandTransportError &&
      cause.phase === 'spawn' &&
      Option.isSome(missingExecutable(cause.cause))
    )
  }

  override get message(): string {
    return `Command transport failed during ${this.phase} (${this.executable}). No complete result was received. Check command availability and inspect the backend before retrying.`
  }
}

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

async function readStream(
  stream: ReadableStream<Uint8Array> | number | undefined
): Promise<string> {
  return stream instanceof ReadableStream ? new Response(stream).text() : ''
}

export function createCommandRunner(): CommandRunner {
  return {
    async run(command, options = {}): Promise<CommandResult> {
      const executable = command[0] ?? '(empty command)'
      let phase: CommandTransportError['phase'] = 'spawn'

      try {
        const proc = spawn(
          [...command],
          options.inheritStdio
            ? { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' }
            : { stdout: 'pipe', stderr: 'pipe' }
        )

        phase = 'read'

        const [stdout, stderr, exitCode] = await Promise.all([
          readStream(proc.stdout),
          readStream(proc.stderr),
          proc.exited.catch(cause => {
            throw new CommandTransportError({ executable, phase: 'wait', cause })
          }),
        ])

        return {
          exitCode,
          stdout,
          stderr,
        }
      } catch (cause) {
        if (cause instanceof CommandTransportError) throw cause

        throw new CommandTransportError({ executable, phase, cause })
      }
    },
  }
}
