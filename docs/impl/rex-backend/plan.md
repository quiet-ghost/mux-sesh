# Experimental Rex backend

DEV-652 plans a third multiplexer backend for [Rex](https://www.superlogical.com/rex/docs), beside
tmux and Herdr. This is a plan only. No backend code exists yet.

## Summary

Rex is a server with a `rex` CLI. It keeps **sessions** that hold **windows** (tabs), which hold
**blocks** (terminals). **Clients**, such as Rex.app, connect to the server and show sessions. Every
object has a permanent id and an optional, mutable, non-unique label. Most commands take `--json`
and use documented exit codes.

A Rex backend maps one Rex session to one mux-sesh workspace. It drives `rex` through the existing
`CommandRunner`, the same way the Herdr adapter drives `herdr`.

- **Status:** Rex is alpha. The installed build is `rex 0.1.0-snapshot.2702`, API revision 27, from
  the snapshot channel. On Linux only the server is public. There is no Linux client to attach from
  a plain terminal (see [Installation](https://www.superlogical.com/rex/docs/installation)).
- **Target:** an experimental backend, off unless `backend: "rex"` is configured, in a release
  after 2.0. It is not part of 2.0.

### Goals

- List, create, start, rename, close, and inspect Rex sessions through `MultiplexerBackend`, with
  the same contract cases tmux and Herdr pass.
- Focus a session when mux-sesh runs inside a Rex terminal, by asking the Rex app that shows the
  picker to switch.
- Fail with typed `MultiplexerError`s that the startup failure screen can explain.
- Never start, stop, or switch a Rex server for the user, and never touch a server the user did not
  select.

### Non-goals

- Attaching to Rex from a plain terminal outside Rex. Linux has no public Rex client.
- Auto-detecting Rex while it is experimental. `REX_BLOCK` alone does not select it.
- Remote servers, `rex hosts`, `rex home`, Tailscale, and multi-server views.
- Agent rows, previous-workspace, and event-driven refresh in the first usable slice. Each one is a
  later slice.
- Floating layers, splits, and block-level targets. mux-sesh works at the session level.

## Evidence

The shapes below were recorded against a throwaway Rex server. Sanitized replies are in
[`fixtures/`](fixtures). Paths there read `/fixture/...`. Anything marked _unverified_ comes from
the docs or help text only.

Isolation was established before any mutating command ran:

1. Every `rex` call ran under `env -i`, so none of the user's `REX_*`, `HERDR_*`, or `TMUX*`
   variables were present. Each call had a temporary `HOME`, `XDG_RUNTIME_DIR`, `XDG_STATE_HOME`,
   `XDG_CONFIG_HOME`, `REX_RUNTIME_DIR`, an empty `REX_CONFIG`, and `REX_AUTOSTART=0`. Each call
   also passed `-S <tmp>/s.sock --autostart=false`.
2. Before the server started, `rex ls --json` against the temporary socket exited 4 with "no Rex
   server is running at …, and autostart is disabled". Nothing was started.
3. The server ran in the foreground as:

   ```sh
   rex server run --listen <tmp>/s.sock --state-dir <tmp>/state/rex --restore=false --config <empty> --no-fs
   ```

4. `ss -xlp` showed the temporary socket held by that server's pid, and the user's
   `$XDG_RUNTIME_DIR/rex/server.sock` held by a different pid. `rex server status --json` reported
   the temporary endpoint and that pid, and `rex ls --json` returned `{"sessions": []}`.
5. At the end, the server was stopped with SIGTERM to its own pid, and no processes with the
   temporary `HOME` were left. The user's server pid was unchanged throughout.

Blocks start the account's login shell (zsh here), not `$SHELL`. Commands are typed into it.

## Concept map

| mux-sesh                            | Rex                                    | Notes                                                                         |
| ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| backend `rex`                       | one server                             | The server that `REX_SERVER` names inside Rex, else the local personal server |
| workspace (`LiveWorkspace`)         | session                                | `session:<uuid>`, never reused                                                |
| workspace title                     | session label                          | ≤128 chars, no control characters, trimmed, not unique, matched without case  |
| unit (`WorkspaceUnitDetails`)       | window                                 | `window:<uuid>`. Rex.app shows windows as tabs                                |
| root pane (`CreatedSessionReceipt`) | first block of the first window        | `block:<uuid>`, from `initial_windows[0].block_ids[0]`                        |
| pane                                | block (terminal)                       | `creator_name: "com.superlogical.terminal"`                                   |
| agent                               | block with Program Status records      | OSC 7501 `idle`/`working`/`done`/`blocked`/`error`. Later slice               |
| attached client                     | client with `info.kind: "app"`         | The CLI is a client too (`kind: "cli"`). Filter it out                        |
| "inside the multiplexer"            | `REX_BLOCK` set and names a live block | `REX_SERVER` names the block's server                                         |

### IDs and labels

- Commands accept a full id, a label, a window position, or an id suffix of 4+ hex digits, in that
  order (see [Targets](https://www.superlogical.com/rex/docs/automate/cli#targets)). Labels can be
  duplicated (`fixtures/ls-duplicate-labels.json`). A label that matches two sessions exits 3 and
  changes nothing (`fixtures/cli-errors.json`).
- **mux-sesh passes only full ids** (`session:…`, `block:…`, `client:…`) to `rex`. Labels are for
  display and `openOrCreate` matching only. Herdr uses ids the same way.
- `rex new --json` returns ids but not the label (`fixtures/new.json`). A blank label makes the
  server choose one, such as `humming-willow`. Renaming to an empty label restores the
  server-chosen label, not the original one.

### Attached and active

`LiveWorkspace.isActive` is true when an app client is attached to the session.
`rex session inspect --json` lists `clients` (`fixtures/session-inspect.json`). That list includes
the `rex` CLI that ran the inspect. So a session is active when some client has
`info.kind === "app"` and `connection_state === "connected"`. _Unverified:_ whether Rex.app
attaches only to the session it shows, or also to sessions in its sidebar. See Open questions.

### Current session

Inside Rex, `current()` is the session that holds `$REX_BLOCK`. Rex accepts a block id wherever it
takes a session:

```sh
rex --autostart=false session inspect "$REX_BLOCK" --json
```

Always pass `$REX_BLOCK` as the explicit target. With no target, a stale `REX_BLOCK` falls back to
the default session. That fails as ambiguous when there are several sessions, and silently picks the
only one when there is one (`fixtures/cli-errors.json`). An explicit stale block id exits 3 with
"no open block has ID". `current()` then resolves to `undefined`.

## Method mapping

Every argv starts with `rex --autostart=false`. Every call also gets `REX_AUTOSTART=0` in its
environment. mux-sesh never passes `-S`, so Rex chooses the server: `REX_SERVER` inside Rex, else the
local personal server socket. Exit codes map as in [Errors](#error-mapping).

| Method                      | Rex commands                                                                                                                       | Reads                                                                                                                                                | Gaps                                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`, `capabilities`      | none                                                                                                                               | `kind: 'rex'`, `previousWorkspace: false`                                                                                                            | See "Previous workspace" below                                                                                                           |
| `list()`                    | `ls --json`, then per session `session inspect <id> --json` and `block call -b <focused block> process`                            | `session_id`, `label`, `windows.length`, `active_window_id`, `windows[].focused_block_id`, `clients[].info.kind`, `foreground.cwd ?? child.cwd`      | 1 + 2N spawns. No created or activity times. `sessions` may be `null` (`rex api describe session.list`)                                  |
| `open(ref)` inside Rex      | `session inspect <id> --json` (exits 3 if gone), `block call -b $REX_BLOCK size` (gives `owner`), `-C <owner> do session.select …` | `owner` client id                                                                                                                                    | `session.select` args are _unverified_. With no app owner, it fails `unsupported`. Returns `focused`                                     |
| `open(ref)` outside Rex     | `session inspect <id> --json`                                                                                                      |                                                                                                                                                      | No handoff exists: no Linux client. Fails `unsupported`: "open it in the Rex app"                                                        |
| `openOrCreate(input)`       | `list()`. On a match, `open`. Else `create`, then `start`, then `open`                                                             | exact label and resolved path                                                                                                                        | Same as `open`. _Unverified:_ whether Rex.app follows a new session by itself                                                            |
| `create(input)`             | `new <title> --cwd <path> --json`                                                                                                  | `session_id`, `initial_windows[0].block_ids[0]`                                                                                                      | A missing `--cwd` silently falls back to `$HOME` and still exits 0 (recorded). `launch-plan` already checks the directory. Doesn't focus |
| `start(receipt, command)`   | `send -b <rootPaneId> "<command>\n"`                                                                                               | exit code                                                                                                                                            | `send` types text only. The trailing newline submits it (recorded). Exit 3 when the block is gone                                        |
| `rename(ref, title)`        | `session rename <id> <title>`, then `session inspect <id> --json`                                                                  | `label` as applied (trimmed, or server-chosen when blank)                                                                                            | Rename prints nothing. Exit 2 for >128 chars or control characters, so validate first                                                    |
| `close(ref)`                | `kill <id>`                                                                                                                        | exit code                                                                                                                                            | Ends every program in the session. Not undoable from the CLI                                                                             |
| `current()`                 | `session inspect "$REX_BLOCK" --json`, only when `REX_BLOCK` is set                                                                | `session_id`, `label`                                                                                                                                | `undefined` outside Rex, and for a stale block (exit 3)                                                                                  |
| `directory(ref)`            | `session inspect <id> --json`, `block call -b <focused block> process`                                                             | `foreground.cwd ?? child.cwd`                                                                                                                        | `pwd` is `{}` unless the shell reports OSC 7 (recorded). Use `process`                                                                   |
| `details(ref, options)`     | `session inspect <id> --json`, `block call -b <focused> process` per window, `capture -b <active focused block> --trim --unwrap`   | `windows[]` → units (`window_id`, `label`, cwd, `foreground.name`), last 16 capture lines, `isActive` as above, `unitLabel: 'Windows'`, `agents: []` | `capture` prints the whole scrollback, up to about 64 MiB, which can pass the runner's 8 MiB stdout limit. See Risks                     |
| `openEditor(path, command)` | inside Rex: `window new -s "$REX_BLOCK" editor --cwd <path> --json -- sh -c <command>`. Outside: return `false`                    | `window_id`                                                                                                                                          | The new window becomes the session's active window. Whether the app follows is _unverified_                                              |

Notes:

- **Inventory in one spawn.** `rex do -e <script> --json` runs a Lua script against the server and
  prints one JSON result. The script below listed four sessions with their views and focused-block
  processes in about 25 ms, one spawn (`fixtures/inventory.json`). It must call
  `session.attach_all` first. Otherwise each `session.view` fails with `409 conflict`
  (`fixtures/cli-errors.json`). The CLI's `--json` replies are documented as stable. The Lua API
  is less settled, so the batch path is a later slice, chosen by measurement. The runner sets
  `stdin: 'ignore'`, so the script goes in `-e`, not `-`.

  ```lua
  local _, aerr = rex.call("session.attach_all", { event_scope = "session" })
  if aerr then return { error = aerr } end
  local out = {}
  for _, s in ipairs(rex.call("session.list").sessions or {}) do
    local view, err = rex.call("session.view", { session_id = s.session_id })
    if not view then
      out[#out + 1] = { session_id = s.session_id, error = err }
    else
      local focused
      for _, w in ipairs(view.windows or {}) do
        if w.window_id == view.active_window_id then focused = w.focused_block_id end
      end
      local process = focused and rex.call("com.superlogical.terminal.process",
        { session_id = s.session_id, block_id = focused, args = {} }) or nil
      out[#out + 1] = { view = view, focused_process = process }
    end
  end
  return { sessions = out }
  ```

  `session.view` has no `clients`, so the script also needs `session.list_clients` per session.
  That call is _unverified_. Lua encodes an empty table as `{}`, so decoders must accept `{}` where
  they expect an empty array.

- **Focus.** Rex has no server-side "switch this client" command. A client chooses what it shows.
  Rex.app and Rex for iOS offer a `session.select` ("Go to Session") action that `rex do` can ask
  a client to perform (see [Mac Actions](https://www.superlogical.com/rex/docs/reference/mac-actions)).
  The client to ask is the owner of the picker's block (`block call size` → `owner`), with
  `rex -C <client>`. With no app connected, `rex do` exits 3 with "no app client is connected"
  (recorded). That becomes `unsupported`. Pass `--timeout` so a client that never answers cannot
  hold the picker. The client's reply decides `focused` versus failure. There is never a handoff.
- **Start command.** `rex new <label> -- <command…>` runs a command as the block's program, and the
  block closes when it exits (`fixtures/new-with-command.json`). The contract's create-then-start
  split, and the partial-outcome case, need a shell first and typed input after. So `start` uses
  `send`.
- **Previous workspace.** `focus_history.reverse` with `not_session_id` steps back through focus
  changes made by the calling principal. This may give `previousWorkspace: true`. Whether app focus
  changes count for the CLI's principal (same uid) is _unverified_.
- **Agents.** Every terminal block exposes `program_status` (`fixtures/block-call-program-status.json`).
  It maps `idle`/`working`/`blocked`/`done` one to one. `error` has no `AgentStatus`, so map it to
  `blocked` (it needs the user), and treat unknown values as `idle`, as the schema advises.
- **Wording.** Rex says "session", so the existing `kind === 'herdr' ? 'workspace' : 'session'`
  branches already read right. `handleLastSession` hard-codes a Herdr refusal message. It must
  name the backend.

## Selection and detection

### Rules

Rex is selected only by configuration while it is experimental. Inner multiplexers keep winning, so
tmux or Herdr started inside a Rex terminal still selects that backend:

| Priority | Rule                                                                      |
| -------- | ------------------------------------------------------------------------- |
| 1        | `HERDR_ENV=1` selects Herdr (unchanged)                                   |
| 2        | `TMUX` selects tmux (unchanged)                                           |
| 3        | `backend: "rex"` selects Rex strictly, inside Rex when `REX_BLOCK` is set |
| 4–5      | Auto detection, unchanged: never Rex while it is experimental             |

When Rex graduates, `REX_BLOCK` can become rule 3, after `TMUX`, as `HERDR_ENV` is for Herdr.

### Config

- `BackendKind` and `BackendPreference` gain `'rex'`. `WorkspaceRef` gains
  `WorkspaceIdentity & { backend: 'rex' }`.
- `src/config/config-document.ts` `backend: oneOf(['tmux', 'herdr', 'rex'])`, `asBackendPreference`,
  and the `mux-sesh.schema.json` enum and description add `rex`.
- Settings `BACKEND_OPTIONS` adds `rex`, with the label "Require a running Rex server (experimental)".
  The icons form adds a `rex` icon key beside `herdr`.
- `docs/configuration.md` "Backend selection" documents rule 3 and says Rex is experimental.

### Availability probe

```sh
rex --autostart=false server status --json      # with REX_AUTOSTART=0 in the environment
```

| Result                                      | `BackendState`                                     |
| ------------------------------------------- | -------------------------------------------------- |
| spawn ENOENT                                | `installed: false`                                 |
| exit 4                                      | `installed: true, running: false`                  |
| exit 0, `api_revision >= 27`, unix endpoint | `running: true, compatible: true`                  |
| exit 0, older `api_revision`                | `running: true, compatible: false`                 |
| exit 0, non-unix `endpoint`                 | `running: true, compatible: false` (remote server) |

`fixtures/server-status.json` has `rex_version`, `api_revision`, `endpoint`, and `pid`.
`MIN_SUPPORTED_REX_API_REVISION = 27`, the revision the fixtures record. `rex version --json`
reports the CLI's own `api_revision` without contacting a server (`fixtures/version.json`). The
text form prints "supports 0 to 27". A CLI and server too far apart refuse to connect with a
message that ends "update the server" or "update the client". _Unverified:_ the exit code. Treat
that text as `protocol-mismatch`.

A local server only: v1 refuses an endpoint that is not `unix://`. Paths mux-sesh checks with
`stat` must be on the machine the server runs on.

### Error mapping

| Rex outcome                                 | mux-sesh                                                   |
| ------------------------------------------- | ---------------------------------------------------------- |
| spawn ENOENT                                | `CommandTransportError` → probe `installed: false`         |
| exit 4                                      | `MultiplexerError('server-stopped')`                       |
| exit 3 on a full id                         | `command-failed`, "Rex session '<title>' no longer exists" |
| exit 3, "no app client is connected"        | `unsupported`                                              |
| exit 2 (mux-sesh validated its input first) | `protocol-mismatch`: the CLI's flags changed               |
| exit 1                                      | `command-failed` with stderr                               |
| exit 130, deadline, abort                   | the runner's `CommandInterrupted`/`CommandTimeoutError`    |
| JSON that fails the schema                  | `invalid-response`                                         |

Startup failure screen messages, when `backend: "rex"` is configured:

- Not installed: "Rex is configured, but the `rex` executable is unavailable. Install Rex, then
  press r."
- Not running: "Rex is configured, but no Rex server is reachable at <endpoint>. mux-sesh does
  not start Rex. Start it with `rex server start`, then press r." The endpoint is `REX_SERVER`, or
  the local socket.
- Incompatible: "Rex is configured, but its server uses API revision <n>; mux-sesh needs 27 or
  newer. Update Rex, then press r."

The screen keeps saying that mux-sesh never starts or switches a backend.

## Testing strategy

- **Decoders.** `src/rex/protocol.ts` uses Effect Schema, like `src/herdr/protocol.ts`. Its tests
  decode every recorded fixture, reject malformed replies as `invalid-response`, ignore unknown
  fields, and accept `null`/`{}` for empty lists.
- **Simulator.** `tests/fixtures/rex-simulator.ts` is a scripted `CommandRunner`, like the Herdr
  simulator. It renders replies in the recorded shapes. Ids are `session:`/`window:`/`block:` uuids
  from a counter that is never reused. Labels are non-unique and match without case. It exits
  0/1/2/3/4 as recorded, and models stop (exit 4) and hang. It records `send` text per block. It
  models one app client that owns the picker block and answers `session.select`. That reply shape
  is unverified and marked so. **It rejects any argv without `--autostart=false`**, so a command
  that could start a server fails the test.
- **Conformance.** Add a Rex column to `tests/backend-conformance.test.ts` over the simulator:
  `stoppedInventory: 'failure'` and `focusesWithoutClient: true` (inside Rex, with an app client).
  Ground truth comes from the simulator's state, not the adapter. Add Rex cases to
  `tests/multiplexer-resolve.test.ts` for the rules and probe table above.
- **Opt-in live test.** `MUX_SESH_REX_TESTS=1 bun test tests/rex-live.test.ts` uses the isolation
  steps from Evidence. Under `env -i` it sets a temporary `HOME`/XDG/`REX_RUNTIME_DIR`,
  `REX_AUTOSTART=0`, and `REX_SERVER=<tmp>/s.sock`. It starts the same `rex server run` as in
  Evidence, in the foreground as its own child. Before any mutation it asserts
  that `server status` reports that endpoint and the child's pid, and that `ls` is empty. It refuses
  to run if the socket equals `$XDG_RUNTIME_DIR/rex/server.sock`. It runs the real adapter through
  the contract cases that need no app client, then SIGTERMs its own pid and removes the directory.
  `MUX_SESH_REX_RECORD=1` rewrites the fixtures from the same run, so refreshing after a Rex
  update is one command.
- **Never live.** Ordinary `bun test` never runs `rex`. No automated test uses the user's server,
  and no test runs without `--autostart=false`.
- **Manual.** Focus through Rex.app needs a Mac or iOS client attached to a disposable server. Keep
  it a manual check, like live Herdr in `docs/impl/session-rework/backend-verification.md`.

## Risks

- **Alpha churn.** Flags, JSON fields, and Lua behavior can change between snapshot builds. Gate on
  `api_revision`. Keep decoders strict on the fields mux-sesh reads and lenient on everything else.
  Keep the fixtures refreshable with one command. Map exit 2 to `protocol-mismatch`, not to a
  generic failure.
- **No Linux client.** Without an app, mux-sesh can list and manage sessions but cannot show one.
  The useful setup is the picker in a Rex terminal shown by Rex.app or iOS. Focus depends on an app
  action whose arguments are unverified.
- **Label ambiguity (exit 3).** Labels are not unique and match without case. Passing anything but
  full ids risks acting on the wrong session, or nothing. Only full ids go to `rex`.
- **Autostart.** Every `rex` command starts a local server by default. One missing
  `--autostart=false` breaks the "never start a backend" rule. Both the flag and `REX_AUTOSTART=0`
  are required, and the simulator enforces the flag.
- **Multi-server.** `REX_SERVER`, `rex hosts`, and `rex home` can point at other machines. mux-sesh
  talks only to the server its environment selects, refuses non-unix endpoints in v1, and names the
  endpoint in errors. A stale `REX_BLOCK` must not fall back to a default session.
- **Performance.** Each `rex` spawn took about 20–26 ms on an idle server. A per-call `list()` is
  1 + 2N spawns. With 20 sessions that is about 1 s, worse than tmux's single
  `list-sessions`. The Lua inventory is one spawn, about 25 ms for 4 sessions. `rex events --json`
  (`fixtures/events.json`) could replace polling, but the runner only runs captured commands with
  a deadline. A long-lived stream needs its own owner, which is a later slice.
- **CLI clients are visible.** Every `inspect`, `rename`, and `kill` attaches a CLI client for the
  duration (`client_connected`/`client_disconnected` in `fixtures/events.json`). Polling adds event
  noise for Rex.app. `isActive` must filter by `info.kind`.
- **Preview size.** `capture` has no line limit and returns up to about 64 MiB. Prefer a tail read
  (see Open questions). Until then, read the preview in the Lua script and return only the last
  16 lines.
- **Silent fallbacks.** `rex new --cwd <missing>` starts in `$HOME` and exits 0. `launch-plan`
  checks the directory first, and `create` should compare the block's `process` cwd and report a
  mismatch.

## Open questions for upstream

1. Is there a supported way to switch an app client to a session from the CLI, for example a
   `rex session focus` command? What are `session.select`'s arguments, and does `rex new` make the
   app follow?
2. Which clients count as "showing" a session? Does Rex.app attach to every session in its sidebar?
3. Is there a timeline for a Linux or TUI client that a plain terminal could hand off to?
4. Could `session.list` or `session.view` report `created_at` and last-activity times?
5. Could `capture`, or the terminal `format` method, take a line limit, such as `--lines N`?
6. What is the stability policy for `--json` output across snapshot builds, and how does it relate to
   `api_revision`?
7. Should `rex new --cwd` with a missing directory fail, instead of starting in `$HOME`?
8. Could `rex do --json` encode empty Lua arrays as `[]`?
9. Does `focus_history.reverse` include focus changes made in the app, for a CLI with the same uid?
10. Could `window ls`/`block ls` support `-A --json`? Today that exits with "requires one session".

## Slices

Each slice is a small issue, in order. Every slice runs `bun run typecheck` and `bun test`.

1. **Rex protocol decoders and fixtures.** Add `src/rex/protocol.ts` with Effect Schema decoders
   for `version`, `server status`, `ls`, `new`, `session inspect`, `block call process`, and
   `window new`. Map exit codes to `MultiplexerError` as in the table. Copy the fixtures to
   `tests/fixtures/rex/`. _Acceptance:_ `tests/rex-protocol.test.ts` decodes every fixture, turns a
   missing `session_id` into `invalid-response`, ignores an unknown field, and accepts
   `sessions: null`.
2. **Rex simulator.** Add `tests/fixtures/rex-simulator.ts`: sessions, windows, and blocks with
   never-reused ids, non-unique labels, exit codes 0–4, stop and hang, and per-block `send` logs. It
   rejects any argv without `--autostart=false`. _Acceptance:_ a simulator self-test shows `new`
   then `ls` lists the new id, a duplicate label exits 3, a stopped server exits 4, and an argv
   without `--autostart=false` fails the test.
3. **Read-only Rex backend.** Add `createRexBackend` with `kind: 'rex'`, `list`, `current`,
   `directory`, and `details`, using per-call CLI reads, `previousWorkspace: false`, and
   `agents: []`. Mutating methods throw `unsupported` for now. _Acceptance:_ the conformance suite's
   read cases (`list` ids, `details` and `directory` on the captured id, stopped server as a typed
   error) pass in a new Rex column. `current()` with a stale `REX_BLOCK` is `undefined`.
4. **Select Rex by configuration.** Add `'rex'` to `BackendKind`/`BackendPreference`, the config
   document, `mux-sesh.schema.json`, and the settings options. Add `probeRexAvailability`,
   resolution rule 3, the startup failure messages, and the docs. _Acceptance:_
   `tests/multiplexer-resolve.test.ts` covers every probe row and rule. `HERDR_ENV` and `TMUX` still
   win over `backend: "rex"`. A stopped server shows the "not running" screen, and `r` retries
   without starting anything. `docs-config.test.ts` passes.
5. **Create, start, rename, and close.** Implement `create`, `start` (`send` with a trailing
   newline), `rename` (with read-back), and `close`. Validate labels first. _Acceptance:_ the
   conformance cases for `create` receipts, `start` in the root pane, `rename` keeping the id,
   `close` sparing a same-label sibling, targets closed elsewhere, and the partial outcome all pass
   in the Rex column.
6. **Focus inside Rex.** Implement `open` and `openOrCreate`: check the target, find the picker
   block's owner, and ask it to `session.select` with a timeout. Outside Rex, and with no app,
   return `unsupported` with a clear message. Generalize the `handleLastSession` refusal text.
   _Acceptance:_ the simulator's app client reports the selected session. With no app, `open` fails
   `unsupported` and the picker stays usable. A manual Rex.app check is recorded in the PR. Blocked
   on Open question 1 for the argument shape.
7. **Opt-in live test and fixture refresh.** Add `tests/rex-live.test.ts` behind
   `MUX_SESH_REX_TESTS=1`, with the isolation assertions from Testing strategy, and
   `MUX_SESH_REX_RECORD=1` to rewrite fixtures. _Acceptance:_ with Rex installed, the test passes,
   leaves no process or temporary directory behind, and refuses to run against
   `$XDG_RUNTIME_DIR/rex/server.sock`. Without the flag it is skipped.
8. **One-spawn inventory.** Replace per-call `list` reads with the `rex do -e` inventory script,
   including `session.list_clients` and a 16-line preview tail. Keep the per-call path as a
   fallback when `rex do` fails. _Acceptance:_ `list()` makes one runner call for N sessions in the
   simulator. The `perf` baseline records both paths. The decoder accepts Lua's `{}` for empty
   lists.
9. **Agent status from Program Status.** Read `program_status` per block and set `agentStatus` and
   `details().agents`, mapping `error` to `blocked`. _Acceptance:_ a block with a `working` record
   lists as `working`. A block with no records adds no agent.
10. **Editor window inside Rex.** Implement `openEditor` with `window new … -- sh -c <command>`
    inside Rex, and `false` outside. _Acceptance:_ the simulator records a new window in the
    picker's session with the path and command. Outside Rex, the existing fallback runs.
11. **Spike: previous workspace.** Check whether `focus_history.reverse` with `not_session_id`
    tracks the app's focus. Turn on `previousWorkspace` only if it does. _Acceptance:_ a written
    result in this directory. The capability changes only with a passing manual check.
