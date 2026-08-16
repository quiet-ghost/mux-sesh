# Configuration

`mux-sesh` reads configuration from `~/.config/mux-sesh/config.json`.

You only need to set the values you want to change. Everything else falls back to sane defaults.

## Starter Config

```json
{
  "backend": "tmux",
  "project_paths": ["~/dev", "~/personal"],
  "repos_path": "~/dev/repos",
  "editor": "nvim",
  "editor_cmd": "nvim -c \"lua vim.defer_fn(function() if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end end, 100)\"",
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

## Defaults

| Setting         | Default               |
| --------------- | --------------------- |
| `backend`       | auto detected         |
| `project_paths` | `~/dev`, `~/personal` |
| `repos_path`    | `~/dev/repos`         |
| `editor`        | `nvim`                |
| `keybind_mode`  | `vim`                 |
| `prefix_key`    | `ctrl+x`              |
| `theme`         | `rosepine`            |
| `color_scheme`  | `system`              |
| `sort_order`    | `live-first`          |
| `zoxide_mode`   | `off`                 |
| `auto_update`   | `true`                |
| `dir_length`    | `1`                   |

## Core Options

| Option            | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `backend`         | Strict backend selection: `tmux` or `herdr`; omit for auto detection |
| `project_paths`   | Directories scanned for candidate projects                           |
| `repos_path`      | Destination for cloned GitHub repositories                           |
| `editor`          | Short editor label used in settings                                  |
| `editor_cmd`      | Command used to open or start workspaces                             |
| `keybind_mode`    | `vim` or `standard`                                                  |
| `prefix_key`      | Prefix for secondary actions                                         |
| `theme`           | Built-in, custom, or `system`                                        |
| `color_scheme`    | `system`, `dark`, or `light`                                         |
| `sort_order`      | `live-first`, `configured-first`, `zoxide-first`, or `alphabetical`  |
| `zoxide_mode`     | `off`, `rank`, or `merge`                                            |
| `auto_update`     | Enables background update checks for supported installs              |
| `dir_length`      | Path depth used when generating session names                        |
| `hidden_sessions` | Glob patterns for sessions to hide                                   |
| `icons`           | Icons for tmux, Herdr, configured, project, and agent rows           |
| `themes`          | Custom theme definitions                                             |
| `default_session` | Fallback startup and preview commands                                |
| `projects`        | Exact path rules                                                     |
| `wildcards`       | Pattern-based project rules                                          |

## Backend Selection

mux-sesh supports tmux sessions and Herdr 0.7.5 or newer workspaces without a Herdr plugin. It maps Herdr workspaces, tabs, and panes to session, window, and pane concepts.

| Priority | Selection rule                                         |
| -------- | ------------------------------------------------------ |
| 1        | `HERDR_ENV=1` selects Herdr                            |
| 2        | `TMUX` selects tmux                                    |
| 3        | `backend` selects the configured backend strictly      |
| 4        | A sole running server is selected; tmux wins a tie     |
| 5        | Installed tmux is the default when neither server runs |

Explicit `backend: "herdr"` requires a compatible Herdr server already running. mux-sesh does not start Herdr or fall back to tmux, and setting changes take effect on the next launch.

```json
{
  "backend": "herdr"
}
```

Icons can distinguish backend rows. `icons.herdr` is empty by default and can be customized.

```json
{
  "icons": {
    "tmux": "",
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

- `startup_command` is used when creating a session for a project.
- `preview_command` renders in the details panel when it succeeds.
- If you do not set `startup_command`, it falls back to `editor_cmd`.

For file targets picked in the new-session flow:

- If `startup_command` contains `{file}`, `{dir}`, or `{}`, the placeholders are interpolated with shell-quoted paths.
- Otherwise the file opens with `editor` plus the quoted file path (for example `nvim '/path/to/file'`).
- File search roots come from `project_paths`. Set `MUX_SESH_DISABLE_FFF=1` to disable fff-backed file search.

## Project Rules

Use `projects` for exact path matches and `wildcards` for broader defaults.

```json
{
  "projects": [
    {
      "path": "~/.dotfiles/hypr/.config/hypr",
      "session_name": "hyprland",
      "listed": true,
      "icon": "",
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

Supported project rule fields:

- `path` for exact path matching
- `pattern` for wildcard matching
- `session_name` to override the generated tmux session name
- `startup_command` to override the default startup command
- `preview_command` to override the default preview command
- `listed` to keep an exact-path target visible in the sessions view
- `icon` to customize the row icon for exact-path entries

Rule resolution order:

1. Exact `projects[]` path match
2. First matching `wildcards[]` rule
3. `default_session`

If no explicit `session_name` is set, mux-sesh prefers the git root name and then applies `dir_length`.

## Listed Sessions

Set `listed: true` on a project rule to keep it visible in the sessions view even before tmux has started it.

This works well for dotfiles, dashboards, and long-lived targets you want one keypress away.

If a live tmux session already exists with the same title, the live session takes precedence.

## Sorting And Zoxide

`sort_order` controls how the list is presented:

- `live-first` puts live sessions before configured placeholders
- `configured-first` puts configured placeholders before live sessions
- `zoxide-first` preserves discovery and zoxide ordering
- `alphabetical` sorts projects and sessions alphabetically

`zoxide_mode` controls how zoxide influences project discovery:

- `off` scans configured roots only
- `rank` reorders discovered projects by zoxide score
- `merge` adds extra zoxide-ranked projects that fall inside configured roots

## Preview Behavior

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

When a preview is requested:

- mux-sesh runs the configured preview command
- if it fails or times out, mux-sesh falls back to a directory listing
- if the project already has a linked tmux session, the preview also includes tmux context

## Themes

Change themes from the TUI: `Ctrl+P`, type `theme`, Enter. Full guide: [themes.md](themes.md).

The default theme is `rosepine`. The picker also lists custom `themes` ids and **System**. `system` follows Omarchy when present, otherwise the terminal palette.

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
