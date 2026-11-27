# Configuration

`mux-sesh` reads configuration from `~/.config/mux-sesh/config.json`.

You only need to set the values you want to change. Everything else falls back to defaults.

A value you do set must be valid. If any are not, mux-sesh opens its startup screen listing each
invalid field by path (for example `projects[0].path (required)`), without showing the values, and
leaves the file unchanged; fix them and press `r` to retry. Empty strings and an empty
`project_paths` list still mean "use the default". Keys mux-sesh does not know are ignored, and
saving from the settings screen keeps them. A save refuses to overwrite a file that is no longer
valid JSON.

Every option accepts a snake_case or a camelCase spelling (`project_paths` or `projectPaths`);
the snake_case spelling wins when both are set. Settings saves write snake_case.

## Schema

[`mux-sesh.schema.json`](../mux-sesh.schema.json) is a JSON Schema (draft-07) for editor
completion and checks. It is generated from the same contract that validates `config.json` at
startup (`bun run schema`), so it accepts exactly the fields and values mux-sesh accepts. The
startup check remains the final authority. A complete example is in
[`config.example.json`](../config.example.json).

## Starter Config

```json
{
  "project_paths": ["~/dev", "~/personal"],
  "repos_path": "~/dev/repos",
  "editor": "nvim",
  "editor_cmd": "nvim",
  "keybind_mode": "vim",
  "prefix_key": "ctrl+x",
  "theme": "rosepine",
  "color_scheme": "system",
  "sort_order": "live-first",
  "zoxide_mode": "off",
  "auto_update": true,
  "dir_length": 1
}
```

## Options

<!-- config-options -->

| Option            | Default               | Purpose                                                                     |
| ----------------- | --------------------- | --------------------------------------------------------------------------- |
| `backend`         | auto detected         | `tmux` or `herdr`; omit for auto detection (see below)                      |
| `project_paths`   | `~/dev`, `~/personal` | Directories scanned for projects and searched by the New file step          |
| `repos_path`      | `~/dev/repos`         | Destination for repositories cloned from New                                |
| `editor`          | `nvim`                | Editor used to open files picked in New                                     |
| `editor_cmd`      | `nvim` with Telescope | Startup command when no `default_session.startup_command` is set            |
| `keybind_mode`    | `vim`                 | `vim` or `standard`; see [keybindings.md](keybindings.md)                   |
| `prefix_key`      | `ctrl+x`              | Prefix for secondary actions; an empty value means the default              |
| `theme`           | `rosepine`            | Built-in theme id, custom `themes` id, or `system`                          |
| `color_scheme`    | `system`              | `system`, `dark`, or `light`                                                |
| `themes`          | none                  | Custom theme definitions; see [themes.md](themes.md)                        |
| `sort_order`      | `live-first`          | `live-first`, `configured-first`, `zoxide-first`, or `alphabetical`         |
| `zoxide_mode`     | `off`                 | `off`, `rank`, or `merge`                                                   |
| `auto_update`     | `true`                | Background update checks for supported installs                             |
| `search_history`  | `true`                | Rank search matches by what you open; see [Search History](#search-history) |
| `dir_length`      | `1`                   | Path depth used when generating session names (a whole number, ≥ 1)         |
| `hidden_sessions` | none                  | Glob patterns for live sessions to hide                                     |
| `pinned_sessions` | none                  | Session names kept at the top; `ctrl+f` and the palette edit the list       |
| `icons`           | built-in icons        | Row icons: `tmux`, `herdr`, `configured`, `config`, `project`, `opencode`   |
| `default_session` | none                  | Fallback `startup_command` and `preview_command`                            |
| `projects`        | none                  | Exact-path project rules                                                    |
| `wildcards`       | none                  | Pattern-based project rules                                                 |

Environment overrides: `MUX_SESH_COLOR_SCHEME=light|dark` overrides the reported color scheme,
`MUX_SESH_DISABLE_FFF=1` turns off native file search, and `MUX_SESH_DISABLE_AUTOUPDATE=1` turns
off update checks. `MUX_SESH_NO_ANIMATION=1` replaces the busy spinner with a still `…`; output
that is not a terminal never animates. The spinner runs only while work is pending: a refresh, a
clone or launch, New planning what Enter will open, or the details inspector reading.

## Backend Selection

mux-sesh supports tmux sessions and Herdr 0.7.5 or newer (protocol 17 or newer) workspaces,
without a Herdr plugin. It maps Herdr workspaces, tabs, and panes to session, window, and pane.

The first matching rule decides:

| Priority | Selection rule                                                |
| -------- | ------------------------------------------------------------- |
| 1        | `HERDR_ENV=1` (running inside Herdr) selects Herdr            |
| 2        | `TMUX` (running inside tmux) selects tmux                     |
| 3        | `backend` selects that backend strictly                       |
| 4        | Auto: a running, protocol-compatible Herdr server             |
| 5        | Auto: an installed tmux, whether or not its server is running |

An explicit `backend` never falls back. `"herdr"` requires a compatible Herdr server that is
already running; `"tmux"` requires the `tmux` executable. mux-sesh never starts Herdr. If the
configured backend is not usable, the startup screen says why and `r` retries. Backend changes
take effect on the next launch.

```json
{
  "backend": "herdr"
}
```

Icons can distinguish backend rows. `icons.herdr` is empty by default.

```json
{
  "icons": {
    "tmux": "",
    "herdr": ""
  }
}
```

## Session Defaults

`default_session` defines fallback behavior for projects that do not have a more specific rule.

```json
{
  "default_session": {
    "startup_command": "nvim",
    "preview_command": "eza --all {}"
  }
}
```

- `startup_command` runs when a session is created for a project. Without it, `editor_cmd` is used.
- `preview_command` runs in the details panel only while you inspect details (`v`); see
  [Preview Behavior](#preview-behavior).
- New's startup step (`ctrl+t`) can replace the startup command for one launch, or clear it so
  nothing runs.

For files opened from New (the file step or a typed file path):

- If `default_session.startup_command` contains `{file}`, `{dir}`, or `{}`, the placeholders are
  replaced with shell-quoted paths (`{}` is the file).
- Otherwise the file opens with `editor` plus the quoted file path (for example
  `nvim '/path/to/file'`).
- File search roots come from `project_paths`. Set `MUX_SESH_DISABLE_FFF=1` to turn off native
  file search; typed file paths still work.

## Project Rules

Use `projects` for exact path matches and `wildcards` for broader defaults.

```json
{
  "projects": [
    {
      "path": "~/.dotfiles/hypr/.config/hypr",
      "session_name": "hyprland",
      "listed": true,
      "icon": "",
      "startup_command": "nvim"
    }
  ],
  "wildcards": [
    {
      "pattern": "~/work/**",
      "startup_command": "bun run dev"
    }
  ]
}
```

Rule fields:

- `path` (required in `projects`) for exact path matching
- `pattern` (required in `wildcards`) for wildcard matching
- `session_name` to override the generated session name
- `startup_command` to override the default startup command
- `preview_command` to override the default preview command
- `listed` (`projects` only) to keep the target visible in the sessions view
- `icon` (`projects` only) to customize the row icon

Rule resolution order:

1. Exact `projects[]` path match
2. First matching `wildcards[]` rule
3. `default_session`

Without `session_name`, mux-sesh prefers the git root name and then applies `dir_length`. tmux
replaces `.` and spaces in names; New shows the final name before anything is created.

## Listed Sessions

Set `listed: true` on a project rule to keep it visible in the sessions view before a session
exists for it. Opening it creates the session from its rule. A live session with the same name
takes the row's place.

## Sorting And Zoxide

`sort_order` controls how the list is presented:

- `live-first` puts live sessions before configured placeholders
- `configured-first` puts configured placeholders before live sessions
- `zoxide-first` preserves discovery and zoxide ordering
- `alphabetical` sorts projects and sessions alphabetically

Pinned sessions stay at the top in every order.

`zoxide_mode` controls how zoxide influences project discovery:

- `off` scans configured roots only
- `rank` reorders discovered projects by zoxide score
- `merge` adds extra zoxide-ranked projects that fall inside configured roots

## Search History

While you type a query, matches you open often and recently rank a little higher. The empty list
is never reordered, and a clearly better match still wins: history only reorders matches of
similar quality (the lift is capped at ×1.4, below the gap between an exact name, a prefix, and
an inner match).

Each confirmed open (a session or workspace focused or attached, or a session created or focused
from a project) is appended to `$XDG_STATE_HOME/mux-sesh/frecency.jsonl`
(`~/.local/state/mux-sesh/frecency.jsonl` by default). The file is created with `0600`
permissions. Each line holds one key, an open count and the time of the last open:

- `session:<backend>:<name>`: a tmux session or Herdr workspace by name (a Herdr agent pane counts
  as its workspace)
- `path:<directory>`: the directory a project or file launch opened in

Nothing else is stored, and the file never leaves your machine. It keeps the newest 1000 entries.
A failed or refused open records nothing. If the file cannot be written, the open still goes
ahead unrecorded; run with `MUX_SESH_DEBUG_PERF=1` to log why. To clear the history, delete the
file; to stop recording and ranking, set `search_history` to `false` (or switch it off in
settings). Turning it off keeps the file; delete it as well to forget what was recorded.

```json
{
  "search_history": false
}
```

## Preview Behavior

The details panel needs a terminal at least 120 columns wide and is not shown on the New
screen. It starts compact: moving through the list shows only what the list already knows.
Toggle details (`v`, or `ctrl+x v` in standard mode) to inspect the selected row; only then
does mux-sesh read session details or run `preview_command`. Toggle again to go back to compact.

`preview_command` supports `{}` interpolation for the shell-quoted selected path.

```json
{
  "default_session": {
    "preview_command": "eza --all {}"
  },
  "projects": [
    {
      "path": "~/dev/projects/mux-sesh",
      "preview_command": "git -C {} status --short"
    }
  ]
}
```

While inspecting:

- mux-sesh runs the configured preview command with a short time limit
- if it fails or times out, mux-sesh falls back to a directory listing
- if the project already has a linked session, the preview also includes its windows or tabs
- a failed refresh keeps the earlier details and marks them stale

## Themes

Change themes from the TUI: `ctrl+p`, type `theme`, `enter`. Full guide: [themes.md](themes.md).

The default theme is `rosepine`. The picker also lists custom `themes` ids and **System**.
`system` follows Omarchy when present, otherwise the terminal palette.

Custom themes follow the shape below:

```json
{
  "themes": {
    "midnight": {
      "name": "Midnight",
      "light": {
        "palette": {
          "neutral": "#faf4ed",
          "ink": "#575279",
          "primary": "#31748f",
          "success": "#286983",
          "warning": "#ea9d34",
          "error": "#b4637a",
          "info": "#56949f"
        }
      },
      "dark": {
        "palette": {
          "neutral": "#191724",
          "ink": "#e0def4",
          "primary": "#9ccfd8",
          "success": "#31748f",
          "warning": "#f6c177",
          "error": "#eb6f92",
          "info": "#9ccfd8"
        }
      }
    }
  }
}
```
