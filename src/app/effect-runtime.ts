import { Cause, Context, Effect, Exit, Layer, ManagedRuntime, Result } from 'effect'
import {
  CommandInterrupted,
  createCommandRunner,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from '../multiplexer/command'
import { isBackendFailure, type BackendFailure } from '../multiplexer/failure'

export type ReadFailure = BackendFailure

export type OperationOutcome<A, E> =
  | { readonly kind: 'success'; readonly value: A }
  | { readonly kind: 'failure'; readonly error: E }
  | { readonly kind: 'defect'; readonly cause: unknown }
  | { readonly kind: 'interrupted' }

class Commands extends Context.Service<Commands, CommandRunner>()('mux-sesh/Commands') {}

export const readEffect = <A>(
  read: (signal: AbortSignal) => Promise<A>
): Effect.Effect<A, ReadFailure> =>
  Effect.tryPromise({ try: read, catch: cause => cause }).pipe(
    Effect.catch(cause =>
      cause instanceof CommandInterrupted
        ? Effect.interrupt
        : isBackendFailure(cause)
          ? Effect.fail(cause)
          : Effect.die(cause)
    )
  )

function outcome<A, E>(exit: Exit.Exit<A, E>): OperationOutcome<A, E> {
  if (Exit.isSuccess(exit)) return { kind: 'success', value: exit.value }

  // A mixed failure must not hide a defect behind a recoverable error.
  const defect = Cause.findDefect(exit.cause)

  if (Result.isSuccess(defect)) return { kind: 'defect', cause: defect.success }

  if (Cause.hasInterrupts(exit.cause)) return { kind: 'interrupted' }

  const error = Cause.findError(exit.cause)

  if (Result.isSuccess(error)) return { kind: 'failure', error: error.success }

  return { kind: 'defect', cause: exit.cause }
}

export function createEffectRuntime(transport: CommandRunner = createCommandRunner()) {
  const runtime = ManagedRuntime.make(Layer.succeed(Commands, transport))

  async function run<A, E>(
    effect: Effect.Effect<A, E, Commands>,
    options?: Effect.RunOptions
  ): Promise<OperationOutcome<A, E>> {
    return outcome(await runtime.runPromiseExit(effect, options))
  }

  const runner: CommandRunner = {
    async run(command: readonly string[], options?: CommandOptions): Promise<CommandResult> {
      let settled: Promise<unknown> = Promise.resolve()

      const result = await run(
        Effect.gen(function* () {
          const commands = yield* Commands

          return yield* readEffect(signal => {
            const pending = commands.run(command, {
              ...options,
              signal: options?.signal ? AbortSignal.any([signal, options.signal]) : signal,
            })

            settled = pending.catch(() => undefined)

            return pending
          })
        })
      )

      switch (result.kind) {
        case 'success':
          return result.value
        case 'failure':
          throw result.error
        case 'defect':
          throw result.cause
        case 'interrupted':
          // Interruption resumes before the child exits; report it only once the command is released.
          await settled
          throw new CommandInterrupted({ executable: command[0] ?? '(empty command)' })
      }
    },
  }

  return { runner, run, dispose: runtime.dispose }
}

export type AppEffectRuntime = ReturnType<typeof createEffectRuntime>
