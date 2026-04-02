# Configuration

`mux-sesh` reads configuration from `~/.config/mux-sesh/config.json`.

You only need to set the values you want to change. Everything else falls back to sane defaults.

## Starter Config

```json
{
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

| Option            | Purpose                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `project_paths`   | Directories scanned for candidate projects                          |
| `repos_path`      | Destination for cloned GitHub repositories                          |
| `editor`          | Short editor label used in settings                                 |
| `editor_cmd`      | Command used to open or start workspaces                            |
| `keybind_mode`    | `vim` or `standard`                                                 |
| `prefix_key`      | Prefix for secondary actions                                        |
| `theme`           | Built-in or custom theme name                                       |
| `color_scheme`    | `system`, `dark`, or `light`                                        |
| `sort_order`      | `live-first`, `configured-first`, `zoxide-first`, or `alphabetical` |
| `zoxide_mode`     | `off`, `rank`, or `merge`                                           |
| `auto_update`     | Enables background update checks for supported installs             |
| `dir_length`      | Path depth used when generating session names                       |
| `hidden_sessions` | Glob patterns for sessions to hide                                  |
| `icons`           | Icons for tmux, configured, project, and OpenCode rows              |
| `themes`          | Custom theme definitions                                            |
| `default_session` | Fallback startup and preview commands                               |
| `projects`        | Exact path rules                                                    |
| `wildcards`       | Pattern-based project rules                                         |

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

`preview_command` supports `{}` interpolation for the selected path.

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

The default theme is `rosepine`, but mux-sesh supports a broader built-in theme catalog plus custom themes under `themes`.

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
