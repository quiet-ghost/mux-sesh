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

export class CommandTimeoutError extends Data.TaggedError('CommandTimeoutError')<{
  readonly executable: string
  readonly timeoutMs: number
}> {
  override get message(): string {
    return `${this.executable} did not finish within ${this.timeoutMs / 1000} s and was stopped. If it was changing sessions, refresh to check the current state before retrying.`
  }
}

export class CommandOutputLimitError extends Data.TaggedError('CommandOutputLimitError')<{
  readonly executable: string
  readonly limitBytes: number
}> {
  override get message(): string {
    return `${this.executable} wrote more than ${this.limitBytes} bytes of output and was stopped; its result was discarded. Check the backend for unexpected output.`
  }
}

export class CommandInterrupted extends Data.TaggedError('CommandInterrupted')<{
  readonly executable: string
}> {
  override get message(): string {
    return `${this.executable} was cancelled before it finished; its result was discarded.`
  }
}

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

// Runs captured commands only. Interactive clients are terminal handoffs run after the picker exits.
export interface CommandOptions {
  signal?: AbortSignal
}

export interface CommandRunner {
  run(command: readonly string[], options?: CommandOptions): Promise<CommandResult>
}

export interface CommandPolicy {
  readonly timeoutMs: number
  readonly maxStdoutBytes: number
  readonly maxStderrBytes: number
  readonly killGraceMs: number
}

export const DEFAULT_COMMAND_POLICY: CommandPolicy = {
  timeoutMs: 15_000,
  maxStdoutBytes: 8 * 1024 * 1024,
  maxStderrBytes: 64 * 1024,
  killGraceMs: 1000,
}

const STDERR_TRUNCATED = '… (stderr truncated)'

type StopReason = 'timeout' | 'output-limit' | 'interrupted'

interface DrainedStream {
  readonly text: string
  readonly truncated: boolean
}

// Keeps reading to EOF after the limit so a chatty child can never block on a full pipe.
async function drainStream(
  stream: ReadableStream<Uint8Array>,
  limitBytes: number,
  onLimit: () => void
): Promise<DrainedStream> {
  const chunks: Uint8Array[] = []
  let retained = 0
  let truncated = false

  const reader = stream.getReader()

  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    const chunk = next.value
    const room = limitBytes - retained

    if (chunk.byteLength <= room) {
      chunks.push(chunk)
      retained += chunk.byteLength
      continue
    }

    if (room > 0) chunks.push(chunk.subarray(0, room))
    retained = limitBytes

    if (!truncated) {
      truncated = true
      onLimit()
    }
  }

  return { text: new TextDecoder().decode(Buffer.concat(chunks)), truncated }
}

export function createCommandRunner(overrides: Partial<CommandPolicy> = {}): CommandRunner {
  const policy: CommandPolicy = { ...DEFAULT_COMMAND_POLICY, ...overrides }

  return {
    async run(command, options = {}): Promise<CommandResult> {
      const executable = command[0] ?? '(empty command)'

      if (options.signal?.aborted) throw new CommandInterrupted({ executable })

      let proc: ReturnType<typeof spawn<'ignore', 'pipe', 'pipe'>>

      try {
        proc = spawn([...command], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
      } catch (cause) {
        throw new CommandTransportError({ executable, phase: 'spawn', cause })
      }

      const child = proc
      let stopReason: StopReason | undefined
      let killTimer: ReturnType<typeof setTimeout> | undefined

      const stop = (reason: StopReason) => {
        if (stopReason || child.exitCode !== null) return
        stopReason = reason
        child.kill('SIGTERM')
        killTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        }, policy.killGraceMs)
      }

      const deadline = setTimeout(() => stop('timeout'), policy.timeoutMs)
      const onAbort = () => stop('interrupted')
      options.signal?.addEventListener('abort', onAbort, { once: true })

      try {
        const [stdout, stderr, exitCode] = await Promise.all([
          drainStream(child.stdout, policy.maxStdoutBytes, () => stop('output-limit')).catch(
            cause => {
              throw new CommandTransportError({ executable, phase: 'read', cause })
            }
          ),
          drainStream(child.stderr, policy.maxStderrBytes, () => {}).catch(cause => {
            throw new CommandTransportError({ executable, phase: 'read', cause })
          }),
          child.exited.catch(cause => {
            throw new CommandTransportError({ executable, phase: 'wait', cause })
          }),
        ])

        switch (stopReason) {
          case 'timeout':
            throw new CommandTimeoutError({ executable, timeoutMs: policy.timeoutMs })
          case 'output-limit':
            throw new CommandOutputLimitError({ executable, limitBytes: policy.maxStdoutBytes })
          case 'interrupted':
            throw new CommandInterrupted({ executable })
          case undefined:
            return {
              exitCode,
              stdout: stdout.text,
              stderr: stderr.truncated ? stderr.text + STDERR_TRUNCATED : stderr.text,
            }
        }
      } catch (cause) {
        // A failed read must not leave the owned child running.
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
          await child.exited.catch(() => undefined)
        }

        throw cause
      } finally {
        clearTimeout(deadline)
        clearTimeout(killTimer)
        options.signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}
