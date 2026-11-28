# Changelog

All notable changes to mux-sesh are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased] — 2.0.0

2.0 rebuilds the picker around one rule: you see what a key will do before it does it, and nothing
is closed, created or cloned that you didn't confirm. mux-sesh now ships as a compiled binary and
no longer needs Bun.

### Upgrading from 1.x

- **npm:** `npm install -g mux-sesh@latest`
- **Bun:** `bun install -g mux-sesh@latest`
- **mise:** `mise upgrade npm:mux-sesh`. Read the mise note below first.
- With `auto_update` on (the default), npm and Bun installs pick up 2.0 in the background on the
  next launch. Restart mux-sesh when the status line says it updated.

Before you upgrade:

- **mise users:** turn off `auto_update` in 1.10, or upgrade straight away with
  `mise upgrade npm:mux-sesh`. 1.10's updater doesn't recognise mise and runs `npm install -g`
  instead, which leaves a second copy in mise's Node folder while you keep running 1.10. If that
  already happened, `npm uninstall -g mux-sesh` removes the stray copy. 2.0 recognises mise and
  Homebrew installs and shows the command to run instead of updating itself.
- **Bun is no longer required.** The package installs a prebuilt binary for Linux (x64 and arm64,
  glibc and musl) and macOS (x64 and arm64), with a baseline build for x64 CPUs without AVX2.
  Windows and other platforms that 1.10 ran on through Bun are not supported. The binary ships as
  an optional dependency, so don't install with `--omit=optional`.
- **Your config is now validated.** An invalid value that 1.10 silently replaced with a default
  (for example a misspelled `backend`, or a project without a `path`) now stops startup on a
  screen that names the field and what it expects. Your file is never changed. Fix the field and
  press `r` to retry. See [Configuration](docs/configuration.md).

Keep a backup of your config before a major upgrade.

| 1.10                                              | 2.0                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `d` killed the selected session immediately       | `d` highlights it; a second `d` closes it                           |
| Invalid config values were silently replaced      | Startup stops and names the invalid field; the file is unchanged    |
| Typing an unmatched name in New created a session | It explains there's no match; `ctrl+g` creates a named session here |
| Auto detection chose tmux when both ran           | A running, compatible Herdr is preferred; set `backend` to choose   |
| Editor Command and Default Startup were separate  | One Startup command; `editor_cmd` still works without one           |
| Needed Bun installed                              | Runs as a compiled binary; Bun is not required                      |
| The cursor always started at the top              | It starts on the session you're in                                  |

### Added

- Compiled per-platform binaries, published as npm packages with a small launcher that finds the
  right binary under npm, Bun and mise.
- New shows a plan before it runs: a summary row names the action (focus, create or clone), the
  directory, the session name and the startup command, and Enter runs exactly that plan.
- New's explicit steps: rename the planned session (`ctrl+n`), change its startup command
  (`ctrl+t`), create a named session in the directory you started from (`ctrl+g`), or open a file
  found by [fff](https://github.com/dmtrKovalenko/fff) (`ctrl+o`).
- Batch close: mark rows with `m`, then `d` opens a review of every target, its directory and what
  it contains. The result is reported per target, and only unfinished targets are offered for
  retry after a refresh.
- Search ranking by what you open often and recently. History stays in
  `~/.local/state/mux-sesh/frecency.jsonl`; turn it off with `"search_history": false`.
- A Settings screen with categories (Appearance, Keys, Sessions, Launch, Projects, General),
  in-place values changed with `←` / `→`, `ctrl+r` to reset, and keyword search.
- List editors for project folders, hidden sessions and pinned sessions, and form editors for
  project and wildcard rules. "Edit as JSON…" remains as an escape hatch, saved with `ctrl+s`.
- A custom prefix key (`Custom…`), checked against the keys mux-sesh can match.
- A details inspector (`v`) for the selected row; details load only when you look at them.
- Startup, configuration and outcome screens that explain what failed, keep your terminal intact,
  and offer a retry of only the safe follow-up.
- Herdr agent panes listed individually in the Agents section, focusing the exact pane.
- [`mux-sesh.schema.json`](mux-sesh.schema.json) for editor completion, generated from the same
  contract that validates the config.
- Development scripts: `dev:config-error`, `dev:backend-error` and `dev:crash` open each failure
  screen from source, and `check:upgrade` tests upgrading a published 1.10 against a local
  registry.

### Changed

- Every screen is redesigned as tmux-style titled panes that follow your theme. Messages appear in
  one footer status line (`info`, `done`, `warn`, `error`) instead of floating toasts.
- `d` asks for confirmation: it highlights the row and a second `d` closes it; any other key
  cancels.
- The cursor starts on the current tmux session or Herdr workspace, inline or in a popup.
- Auto detection prefers a running, protocol-compatible Herdr over tmux. An explicit `backend` is
  checked strictly and never falls back.
- The config is validated at startup; invalid fields stop startup instead of being replaced with
  defaults. Unknown keys are still ignored and kept on save.
- Editor Command and Default Startup are merged into one **Startup command**
  (`default_session.startup_command`); `editor_cmd` is still used when no startup command is set.
- An unmatched query in New explains there's no match instead of creating a session named after
  it.
- Projects rows open through the same plan as New, so an open project is focused, not duplicated.
- Every list (sessions, projects, New, the command palette, settings and pickers) uses one fuzzy
  matcher with best-first results.
- tmux sessions are tracked by stable IDs, so renames keep the selection and similar names can't
  retarget a command. A stopped tmux server shows an empty list instead of an error.
- Footer hints come from the live state, and the keybinding docs are checked against the app's
  action catalog in tests.
- Cold start is much faster: the binary imports the app in about 19 ms, against about 100 ms from
  source.
- Updates detect compiled installs, verify the installed version afterwards, and leave mise and
  Homebrew installs to their own tools.
- The README and the configuration, keybinding, workflow and theme docs are rewritten for 2.0.
- Releases are published from GitHub Actions with signed npm provenance, using npm trusted publishing (OIDC) for every package that has it configured.
- Internal: the source tree is reorganized into domain modules; no behaviour change.

### Removed

- Bun as a runtime requirement for installed copies. A checkout still runs from source with Bun.
- Support for Windows and other platforms that ran 1.10 only through Bun.
- The OpenCode statistics panel, which polled private OpenCode storage and spawned commands
  whenever an OpenCode agent was selected.
- The fallback letter icons on rows.

### Fixed

- The folder list skips hidden folders, caches and virtualenvs (`.config`, `__pycache__`, `venv`,
  `site-packages`), even with `~` as a project root, which also makes scanning much faster.
- The directory you started mux-sesh from is preserved through symlinks and wrappers.
- Every subprocess and retry is bounded, so a hung command or an open pipe can't freeze the picker.
- The text cursor and selection follow the theme in every text field, so the cursor stays visible
  on light themes.
- Rename and close outcomes are reported truthfully, and refusals show as warnings.
- The crash screen stays up even when a crash interrupts startup, and fatal reports stay readable
  after the terminal is restored.
- A batch close refuses to close the session hosting the picker, so it can't end mux-sesh before it
  reports.

### Security

- Cloning refuses GitHub URLs that carry credentials, git credential prompts fail fast instead of
  hanging, and an existing destination is reused only after it is verified. Nothing is deleted.
- Closing only ever closes tmux sessions and Herdr workspaces; no files, worktrees or branches are
  deleted.
- Diagnostics reports redact credentials, control characters and home paths, and bound oversized
  values, before the report is shown, copied or shared. `o` on the crash screen asks before
  opening a prefilled GitHub issue.
- Herdr's API is decoded with a schema at the boundary, so protocol changes surface as clear
  errors.

## 1.x and earlier

See [GitHub Releases](https://github.com/quiet-ghost/mux-sesh/releases) for 1.x and earlier.
