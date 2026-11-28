# mux-sesh

A keyboard-driven picker for tmux sessions and Herdr workspaces. Switch to what's running, start a
session from any project, and close what you're done with, all from one popup.

<p align="center">
  <img src="screenshot.png" alt="mux-sesh screenshot" width="800">
</p>

- **Switch fast:** live sessions, pinned sessions and agent panes in one list, with fuzzy search
  that learns what you open.
- **Start from a project:** pick a folder, a file or a GitHub URL. mux-sesh shows exactly what
  Enter will do (focus, create or clone) before it does it.
- **Close safely:** every close is confirmed, and nothing but the session itself is ever removed.
- **Configure in the app:** a settings screen with real editors, saved to one JSON file.

## Install

You need **tmux** or **Herdr 0.7.5 or newer**, and **git** if you want to clone repositories from
mux-sesh. Pick one:

```bash
npm install -g mux-sesh
```

```bash
bun install -g mux-sesh
```

```bash
mise use -g npm:mux-sesh
```

The package installs a prebuilt binary, so mux-sesh doesn't need Bun or Node at runtime. Supported
platforms are Linux (x64 and arm64, glibc and musl) and macOS (x64 and arm64), with a baseline
build for x64 CPUs without AVX2. The binary ships as an optional dependency, so don't install with
`--omit=optional`.

Check it works:

```bash
mux-sesh
```

### Updating

With `auto_update` on (the default), npm and Bun installs update themselves in the background;
the status line tells you to restart when a new version is ready. mise and Homebrew installs are
left to their own tool, and mux-sesh shows the command to run, such as `mise upgrade npm:mux-sesh`.

Upgrading from 1.x? Read the [CHANGELOG](CHANGELOG.md) first: 2.0 validates your config and
changes a few defaults.

To uninstall, use the same tool: `npm uninstall -g mux-sesh`, `bun remove -g mux-sesh` or
`mise uninstall npm:mux-sesh`.

## Open it from a key

mux-sesh works best as a popup over your current work.

**tmux:** add this to `~/.tmux.conf`, then reload with `tmux source-file ~/.tmux.conf`:

```tmux
bind-key -n M-w popup -E -w 62% -h 70% "mux-sesh"
```

`Alt+W` now opens the picker. To start new sessions in the current pane's directory, add
`-d "#{pane_current_path}"` before `"mux-sesh"`.

**Herdr:** add a popup command to Herdr's `config.toml`, then run `herdr server reload-config`:

```toml
[[keys.command]]
key = "prefix+alt+w"
type = "popup"
command = "mux-sesh"
description = "mux-sesh"
width = "70%"
height = "70%"
```

You can also run `mux-sesh` from any shell. Without tmux or Herdr around it, mux-sesh uses a
running Herdr server first, then tmux (see [Backend Selection](docs/configuration.md#backend-selection)).

## Use it

The picker opens on the session you're in. Type to search (in `vim` mode, press `i` first), move
with `j`/`k` or the arrows, and press `enter` to switch.

| To…                                     | Do this                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Switch to a session                     | Select it and press `enter`, or press `1`–`9` for a visible row           |
| Start a session from a project          | Press `n`, pick a project or folder (or paste a GitHub URL), then `enter` |
| Open a file in a new session            | In New: `ctrl+o`, type a file name or path, then `enter`                  |
| Change the new session before it starts | In New: `ctrl+n` renames it, `ctrl+t` changes its startup command         |
| Start a session in the current folder   | In New: `ctrl+g`                                                          |
| Close a session                         | Press `d`, then `d` again to confirm; any other key cancels               |
| Close several sessions                  | Mark each with `m`, then press `d` to review and confirm them together    |
| See details about the selected row      | `v`                                                                       |
| Run any command, change the theme       | `ctrl+p`, then type, such as `theme` or `settings`                        |

New shows a summary line that says exactly what `enter` will do, for example
`Focus existing 'api' in ~/dev/api`. Cloning a GitHub URL goes into your `repos_path` and never
deletes anything. Closing only ever closes the tmux session or Herdr workspace: files, worktrees
and branches are never touched.

### Essential keys

Default mode is `vim`, with `ctrl+x` as the prefix for secondary actions.

<!-- keys: vim normal subset -->

| Key        | Action                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| `enter`    | Open the selected row: focus a live session, or create from a project  |
| `i`        | Search                                                                 |
| `n`        | New session                                                            |
| `d`        | Close the selected session (`d` again confirms), or review marked rows |
| `m`        | Mark or unmark a row for a batch close                                 |
| `v`        | Toggle details                                                         |
| `ctrl+x s` | Show sessions                                                          |
| `ctrl+x p` | Show projects                                                          |
| `ctrl+x r` | Rename session                                                         |
| `ctrl+p`   | Command palette; type `theme` for the theme picker                     |

Quit with `q` or `esc`. In text fields, letters type; only arrows, `enter`, `esc` and `ctrl+…`
keys act. Prefer typing straight into search? Set `"keybind_mode": "standard"`. Every key for both
modes: [docs/keybindings.md](docs/keybindings.md).

## Set it up

mux-sesh runs with no config. To tell it where your projects live, open **Settings**
(`ctrl+p`, then `settings`) or edit `~/.config/mux-sesh/config.json`:

```json
{
  "project_paths": ["~/dev"],
  "repos_path": "~/dev/repos",
  "theme": "rosepine",
  "default_session": {
    "startup_command": "nvim"
  }
}
```

- `project_paths`: folders scanned for projects and searched by New.
- `repos_path`: where GitHub URLs are cloned.
- `default_session.startup_command`: what runs in a new session.
- `theme`: any built-in theme, or `system` to follow Omarchy or your terminal.

Changes from Settings save immediately. Edits to the file apply the next time mux-sesh starts. If
the file has an invalid value, mux-sesh shows which field is wrong instead of starting, and never
changes the file; fix it and press `r`. For completion and validation in your editor, point it at
[`mux-sesh.schema.json`](mux-sesh.schema.json).

Project rules (a fixed session name, a startup command or an icon per project), wildcard rules,
pinned and hidden sessions, sorting, zoxide and themes are all covered in
[docs/configuration.md](docs/configuration.md).

### Search history

Searches rank what you open often a little higher. Names, folders and open counts are kept in
`~/.local/state/mux-sesh/frecency.jsonl` and never leave your machine. Delete the file to clear it,
or set `"search_history": false`. See [Search History](docs/configuration.md#search-history).

## When something goes wrong

- **mux-sesh won't start:** a startup screen names the problem (an invalid config field, or no
  usable tmux or Herdr) and what to do. Press `r` to retry after fixing it.
- **"no prebuilt binary":** reinstall without `--omit=optional`.
- **A crash:** a recovery screen shows a diagnostics report. `c` copies it, `o` asks before opening
  a prefilled GitHub issue (opening it sends the report to GitHub), `r` recovers and `q` quits. The
  report is redacted, but read it before sharing.

More: [Crash Recovery](docs/workflows.md#crash-recovery).

## Docs

- [Workflows](docs/workflows.md): step-by-step guides for every task
- [Configuration](docs/configuration.md): every option and rule
- [Keybindings](docs/keybindings.md): every key, in vim and standard mode
- [Themes](docs/themes.md): built-in themes, custom themes and Omarchy
- [Changelog](CHANGELOG.md)

## Development

```bash
bun install
bun run typecheck
bun test
bun run dev
```

`bun run dev` runs from source with your real config. `bun run dev:config-error`,
`dev:backend-error` and `dev:crash` open each failure screen. [AGENTS.md](AGENTS.md) describes the
source layout, every script, the test conventions and the rules for never touching a live tmux or
Herdr session from tests. Builds, packing and release checks are in
[Install From Source](docs/workflows.md#install-from-source).

## License

MIT. See [LICENSE](LICENSE).

## Related

- [mux-manager](https://github.com/quiet-ghost/mux-manager) for Telescope-based tmux session
  management inside Neovim
- Built with [OpenTUI](https://github.com/anomalyco/opentui)
