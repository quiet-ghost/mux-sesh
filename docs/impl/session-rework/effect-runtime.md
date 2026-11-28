# Typed command and Herdr refresh tracer

DEV-312 pins Effect 4.0.5, checked against the installed types and the
[v4 runtime documentation](https://www.effect.website/docs/v4/runtime).

## Composition and boundaries

- `useEffectRuntime` creates one application `ManagedRuntime` per mounted controller and disposes
  it on unmount. Its layer supplies the existing injectable `CommandRunner` transport.
- `effects.runner` is the local Promise compatibility bridge passed to backend resolution.
  It runs commands through the shared layer and preserves typed failures, rather than rejecting
  with an opaque Effect fiber failure.
- Agents polling is an `agents-poll` request to the single-flight `SessionInventory` owner
  (`src/app/session-inventory.ts`), which runs the Herdr backend, protocol parser and inventory
  derivation through that runtime, as startup and refresh loads do. A poll never changes the
  view and does not advance the inventory revision.
- The UI bridge returns success, expected failure, defect, or interruption. Expected transport
  and multiplexer/protocol errors leave inventory and selection intact and show a retry notice.
  Defects go to the existing sanitized fatal handler. Interruption publishes nothing.

## Decision: Effect at the boundaries, not a full migration

Effect is used in two ways, on purpose:

- **As a data library everywhere.** `Schema` decodes external input at the boundary: the config
  document, the Herdr protocol, frecency history entries, package manifests, the npm registry
  response, and filesystem and spawn error codes.
  `Data` defines tagged errors and values, and `Result` / `Option` carry expected outcomes.
- **As a runtime only at the `CommandRunner` bridge.** `Effect`, `Layer`, `Context`,
  `ManagedRuntime`, `Exit` and `Cause` appear only in `src/app/effect-runtime.ts`, which wraps the
  injectable `CommandRunner` so runs are interruptible and report success, expected failure,
  defect or interruption. Everything else is ordinary async TypeScript and React.

No wider migration to Effect services or layers is planned. Don't convert modules to `Effect.gen`
or add layers just for consistency; a change to this boundary needs its own design decision.

## Command results

A nonzero process exit is ordinary `CommandResult` data, including a real exit 127. Spawn,
stream-read, and wait failures reject with `CommandTransportError`, including the executable,
phase, and original cause; command arguments and raw causes are not interpolated into its message.
Availability probes recognize only spawn ENOENT as a missing executable. Other transport failures
remain failures rather than silently becoming "not installed."

The command runner drains stdout/stderr concurrently and observes exit in the same `Promise.all`.

## Command lifetime (DEV-313)

The command runner only runs captured commands, under `DEFAULT_COMMAND_POLICY`: a 15 s deadline,
8 MiB of stdout, 64 KiB of stderr, and a 1 s grace period between SIGTERM and SIGKILL. Both
streams are drained to EOF, so noisy stderr cannot block stdout.

- Deadline → `CommandTimeoutError`; stdout over its limit → `CommandOutputLimitError`. The child
  is stopped and its output is discarded. Excess stderr is cut, with a truncation marker.
- `AbortSignal` → `CommandInterrupted`. An already-aborted signal never spawns. The Effect bridge
  passes each fiber's signal, so disposing the application runtime stops in-flight commands. The
  bridge reports the interruption only after the child has exited.
- Only the spawned child pid is signalled; Herdr/tmux servers and session jobs are never targeted.
- Interactive clients are not runner commands. Backends return a `TerminalHandoff` (tmux attach,
  Herdr client, editor) and `requestShutdown(code, handoff)` runs it only after the React tree is
  unmounted, the renderer destroyed, and terminal modes reset (DEV-322). A failed or missing attach
  exits nonzero with the retry command; the focused or created session is left running.
- Nothing is retried. A stopped mutation's effect is unknown; the timeout message asks for a
  refresh before retrying.

A Herdr refresh still cannot stop its own subprocess when only that refresh is aborted, because
`list` takes no signal; its result is discarded and the deadline bounds the child.
`MultiplexerBackend.details` accepts a signal (DEV-330), so closing the details inspector or
moving the selection stops its reads.

## Verification

`tests/command.test.ts` first reproduced fabricated exit 127. Recording-runner Herdr tests cover
failure and recovery; a rendered polling fixture verifies that all inventory collections and
the selected item survive expected failure. Runtime tests distinguish defects, expected failures,
interruption, disposal, and late Promise results. All use fixtures or owned Bun subprocesses;
no live Herdr workspaces are controlled.
