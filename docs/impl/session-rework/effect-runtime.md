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
Effect's `tryPromise` is not subprocess cancellation: aborting a refresh discards its result, but
does not yet kill its underlying legacy command. DEV-313 owns command scopes, output limits,
timeouts, and subprocess interruption. There is no mutation retry policy in this tracer.

## Verification

`tests/command.test.ts` first reproduced fabricated exit 127. Recording-runner Herdr tests cover
failure and recovery; a rendered polling fixture verifies that all inventory collections and
the selected item survive expected failure. Runtime tests distinguish defects, expected failures,
interruption, disposal, and late Promise results. All use fixtures or owned Bun subprocesses;
no live Herdr workspaces are controlled.
