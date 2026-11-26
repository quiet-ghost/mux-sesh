# Typed command and Herdr refresh tracer

DEV-312 pins Effect 4.0.5, checked against the installed types and the
[v4 runtime documentation](https://www.effect.website/docs/v4/runtime).

## Composition and boundaries

- `useEffectRuntime` creates one application `ManagedRuntime` per mounted controller and disposes
  it on unmount. Its layer supplies the existing injectable `CommandRunner` transport.
- `effects.runner` is the local Promise compatibility bridge passed to backend resolution.
  It runs commands through the shared layer and preserves typed failures, rather than rejecting
  with an opaque Effect fiber failure.
- `refreshHerdrInventory` runs the existing Herdr backend, protocol parser, inventory derivation,
  and recording-runner seam through that runtime. Only Agents polling migrates in this slice;
  manual refresh, startup recovery, and mutation outcomes are not rewritten.
- The UI bridge returns success, expected failure, defect, or interruption. Expected transport
  and multiplexer/protocol errors leave inventory and selection intact and show a retry notice.
  Defects go to the existing sanitized fatal handler. Interruption publishes nothing.

## Command results

A nonzero process exit is ordinary `CommandResult` data, including a real exit 127. Spawn,
stream-read, and wait failures reject with `CommandTransportError`, including the executable,
phase, and original cause; command arguments and raw causes are not interpolated into its message.
Availability probes recognize only spawn ENOENT as a missing executable. Other transport failures
remain failures rather than silently becoming "not installed."

The command runner drains stdout/stderr concurrently and observes exit in the same `Promise.all`.

## Command lifetime (DEV-313)

Captured commands (not `inheritStdio`) follow `DEFAULT_COMMAND_POLICY`: a 15 s deadline,
8 MiB of stdout, 64 KiB of stderr, and a 1 s grace period between SIGTERM and SIGKILL. Both
streams are drained to EOF, so noisy stderr cannot block stdout.

- Deadline → `CommandTimeoutError`; stdout over its limit → `CommandOutputLimitError`. The child
  is stopped and its output is discarded. Excess stderr is cut, with a truncation marker.
- `AbortSignal` → `CommandInterrupted`. An already-aborted signal never spawns. The Effect bridge
  passes each fiber's signal, so disposing the application runtime stops in-flight commands. The
  bridge reports the interruption only after the child has exited.
- Only the spawned child pid is signalled; Herdr/tmux servers and session jobs are never targeted.
- Interactive clients (`inheritStdio`) own the terminal: no deadline, limit, or cancellation.
- Nothing is retried. A stopped mutation's effect is unknown; the timeout message asks for a
  refresh before retrying.

A Herdr refresh still cannot stop its own subprocess when only that refresh is aborted, because
`MultiplexerBackend` methods take no signal; its result is discarded and the deadline bounds the
child. Threading signals through backend methods belongs with the backend contract work.

## Verification

`tests/command.test.ts` first reproduced fabricated exit 127. Recording-runner Herdr tests cover
failure and recovery; a rendered polling fixture verifies that all inventory collections and
the selected item survive expected failure. Runtime tests distinguish defects, expected failures,
interruption, disposal, and late Promise results. All use fixtures or owned Bun subprocesses;
no live Herdr workspaces are controlled.
