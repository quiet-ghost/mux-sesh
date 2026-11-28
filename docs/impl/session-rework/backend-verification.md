# Backend conformance and terminal handoff verification

DEV-348 runs both multiplexer adapters through one contract suite. It also adds opt-in checks
that run the real picker in real pseudo-terminals. Ordinary `bun test` stays deterministic. It only
starts tmux servers it owns, on sockets in a temporary directory, and it never runs `herdr`.

## Default suite: contract matrix

`tests/backend-conformance.test.ts` runs one set of contract cases against each column:

- **tmux**: the real adapter against a disposable `tmux -L` server. `TMUX_TMPDIR`, `HOME`,
  `XDG_CONFIG_HOME`, and `SHELL=/bin/sh` point into a temporary directory for every call. A server
  the adapter starts by itself therefore cannot load the user's `tmux.conf` or plugins. The suite is
  skipped when `tmux` is not installed.
- **Herdr protocol-22**: the real adapter over `tests/fixtures/herdr-simulator.ts`. The simulator is
  a scripted server that replies in the Herdr 0.9.5 wire format: `w<n>` ids from a counter that
  never reuses an id, full `WorkspaceInfo`/`TabInfo`/`PaneInfo` objects, and failures as exit 1
  with a JSON error envelope on stderr.
- **Herdr protocol-17**: the same simulator in the sanitized Herdr 0.7.5 format already used in
  `tests/herdr-backend.test.ts`. Snapshots carry only the fields the adapter reads, and mutation
  replies carry ids but no workspace details.

| Contract case                                                               | tmux  | Herdr 22 | Herdr 17 |
| --------------------------------------------------------------------------- | :---: | :------: | :------: |
| `list` reports the ids the server assigned                                  | pass  |   pass   |   pass   |
| `create` returns the server-reported id and root pane, and does not focus   | pass  |   pass   |   pass   |
| `start` runs the command in the receipt's root pane                         | pass  |   pass   |   pass   |
| `open` outside the multiplexer checks the target, then hands off to its id  | pass  |   pass   |   pass   |
| `open` inside the multiplexer focuses without a handoff                     | skip¹ |   pass   |   pass   |
| `openOrCreate` reuses the existing workspace                                | pass  |   pass   |   pass   |
| `rename` keeps the id and returns the name the backend applied              | pass  |   pass   |   pass   |
| `close` removes exactly the captured id and leaves look-alike siblings      | pass  |   pass   |   pass   |
| A target closed elsewhere: `open`/`rename`/`close` fail recoverably         | pass  |   pass   |   pass   |
| A stopped server is recoverable (tmux: empty inventory; Herdr: typed error) | pass  |   pass   |   pass   |
| A hung server is stopped at the runner deadline as `CommandTimeoutError`    | pass² |   pass   |   pass   |
| Partial outcome: startup fails after create, the session is kept and named  | pass  |   pass   |   pass   |
| `details` and `directory` read the captured id                              | pass  |   pass   |   pass   |

1. tmux focuses by switching an attached client. The opt-in terminal harness covers this case.
2. The tmux server is frozen with `SIGSTOP`, so the timeout comes from the real owned runner. The
   Herdr simulator rejects at the deadline, the same way the runner reports it.

"Captured, not guessed" is checked against ground truth read from the server, not from the adapter.
For each `create`, the set of server ids gained exactly the receipt's id.

`tests/tmux-backend-locale.test.ts` runs the tmux adapter with `LANG=C` against a disposable
server. It checks that inventory reads keep real ids and non-ASCII names. It also checks that the
attach handoff does not force UTF-8.

## Opt-in: terminal handoff harness

```sh
MUX_SESH_TERMINAL_TESTS=1 bun test tests/terminal-handoff.test.ts
```

The harness needs `tmux`, `/bin/sh`, `env`, and `stty`. For each test it starts two tmux servers,
both inside one temporary directory, and then kills them and removes the directory:

- **host** (`tmux -S <root>/host.sock`): its pane is the pseudo-terminal that the picker, or a tmux
  client, runs in. `remain-on-exit` keeps the pane after the picker exits, so the harness can read
  its exit status and final terminal modes.
- **target** (default socket under `TMUX_TMPDIR=<root>/t`): the only server the picker can reach.

The picker is the real `src/index.tsx`, started under `env -i` with a temporary `HOME`/XDG
directories, `LANG=C.UTF-8`, and a `PATH` that holds only `bun` and a tmux shim. The user's tmux
server, mux-sesh config, and Herdr are out of reach. When the shim sees `attach-session`, it
records its argv, `stty -a`, and the host pane's `#{alternate_on}`, and then execs the real tmux.

| Check                                          | What it proves                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External attach after terminal restore         | The handoff attaches to the captured `$id`. Before `tmux attach` runs, the pty is back in cooked mode (`icanon echo isig`) and the alternate screen is off. After detach, the picker exits 0 with the alternate screen and mouse reporting off.             |
| Target closed before selection                 | Picking a session that vanished shows "no longer available" in the picker. No attach runs, and the picker stays usable and then quits with status 0.                                                                                                        |
| `SIGINT`/`SIGTERM`/`SIGHUP`/`SIGQUIT` on a TTY | Exit codes 130/0/0/131, with the alternate screen and mouse reporting reset in a real terminal. `tests/signal-ownership.test.ts` uses pipes, not a terminal.                                                                                                |
| Picker host inside tmux                        | With a real attached client, a batch that marks the picker's own session refuses it and closes only the other session. Focus stays on the picker host. Selecting another session switches the client in place: there is no handoff, and the picker exits 0. |

The opt-in suite never touches the user's live sessions. It only uses ids that the harness's own
servers print (`new-session -P -F '#{session_id}'`).

## Opt-in: Herdr fixture against the installed schema

```sh
MUX_SESH_HERDR_SCHEMA_TESTS=1 bun test tests/backend-conformance-schema.test.ts
```

This check runs `herdr api schema --output <tmp>`, which writes the bundled schema to a file. It
does not start, contact, or change a Herdr server. It then checks two things:

- The installed protocol is 22, the version the fixture records.
- Every required field of `WorkspaceInfo`, `TabInfo`, `PaneInfo`, and `PaneLayoutSnapshot` is
  present in the simulator's snapshot, create, and rename replies.

When Herdr bumps its protocol, this check fails. To fix it, refresh the simulator and add the
older format as another fixture column.

## Manual: live Herdr

No automated check starts or changes a Herdr server. mux-sesh's Herdr commands (`herdr api
snapshot`, `herdr workspace …`, and the `herdr` attach handoff) pass no `--session`. They address
whichever session the environment selects, which outside Herdr is the default session. Do the
manual checks only where that session is disposable:

1. Use a throwaway user account or container where no real Herdr work exists. Start Herdr there,
   for example with `herdr --session mux-sesh-verify`, and create two or three workspaces.
2. In a pane of that session, run `herdr api snapshot`. Confirm it lists only the throwaway
   workspaces before going on.
3. In that pane, run `bun run dev`. Mark the picker's own workspace and one other workspace, then
   press `d`. The review should refuse the picker host and close only the other workspace.
4. Outside Herdr, run `bun run dev` with Herdr selected only if step 2's check also holds there for
   the default session. Pick a workspace. Herdr should attach only after the picker's screen is
   gone, and the terminal should be usable after you detach.
5. Remove the throwaway session when you are done.

## Defects found

- `createCommandRunner` waited for stdout/stderr EOF after a deadline, output-limit, or
  cancellation stop. When another process held the pipes, the call never returned. A stopped tmux
  server holding the fds its client passed it is one such process, and a background grandchild is
  another. Stopped commands now cancel their readers one grace period after the kill
  (`tests/command-deadline.test.ts`).
- In a non-UTF-8 locale, tmux sanitized captured replies and turned the U+001F field separator
  into `_`, so every inventory read failed. Captured tmux commands now pass `-u`. The attach handoff
  is unchanged (`tests/tmux-backend-locale.test.ts`).
