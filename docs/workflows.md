# Workflows

This page covers the common ways to use `mux-sesh` with tmux sessions or Herdr 0.7.5 or newer workspaces.

| Backend | Managed unit |
| ------- | ------------ |
| tmux    | Session      |
| Herdr   | Workspace    |

## Open mux-sesh Inside tmux

The smoothest setup is a popup binding.

```tmux
bind-key -n M-w popup -E -w 62% -h 70% "mux-sesh"
```

Reload tmux after updating your config:

```bash
tmux source-file ~/.tmux.conf
```

## Open mux-sesh With Herdr

Run mux-sesh inside Herdr or while its server is already running. No Herdr plugin is needed.

```bash
herdr status
mux-sesh
```

Herdr workspaces, tabs, and panes appear as sessions, windows, and panes. Native agent status and details are visible but read-only.

## Switch To Something Already Running

Use the sessions view when the target tmux session or Herdr workspace already exists.

```text
j / k to move
Enter to attach
1-9 for quick select
```

## Search

In vim mode, search is explicit:

```text
i
type a query
Enter
```

In standard mode, search is always active:

```text
type a query
Enter
Esc to clear
```

## Create A Session From A Project

Enter new-session mode, pick a project, and confirm.

```text
n
type to narrow the list
Enter
```

If the project is already linked to the active backend, mux-sesh attaches to it. Otherwise it creates a session or workspace; newly created Herdr workspaces are focused automatically.

## Create A Session From A File

The new-session flow also searches files under your `project_paths` as you type.

```text
n
type a file name (typo-resistant)
Enter
```

Selecting a file:

- creates a session or workspace in the file's parent directory
- opens the file with your configured `editor` (for example `nvim '/path/to/file'`)
- focuses the newly created Herdr workspace or tab automatically
- attaches to the existing target if one is already running for that file

You can also type a path directly:

```text
n
~/notes/todo.md
Enter
```

File search is powered by [fff](https://github.com/dmtrKovalenko/fff) and runs entirely locally. If the native fff library is unavailable, mux-sesh falls back to directory-only candidates. Set `MUX_SESH_DISABLE_FFF=1` to force the fallback.

To customize how files open, set a `default_session.startup_command` containing a `{file}` placeholder:

```json
{
  "default_session": {
    "startup_command": "nvim {file}"
  }
}
```

`{dir}` is also available and expands to the file's parent directory. Both are shell-quoted automatically.

## Clone From GitHub

The new-session flow also accepts GitHub URLs.

```text
n
paste a GitHub URL
Enter
```

Examples:

```text
https://github.com/user/repo
git@github.com:user/repo.git
```

Repositories are cloned into `repos_path`.

## Jump To Related Sessions

These actions are useful when a project is already part of a broader multiplexer workflow.

- previous session: `prefix + l`, or direct `l` when no prefix is configured in vim mode; unavailable in Herdr
- git-root session: `prefix + g`, or direct `g` when no prefix is configured in vim mode
- edit configured target: `prefix + e`, or direct `e` when no prefix is configured in vim mode

## Use Listed Targets

Exact project rules can stay visible in the sessions view even before tmux has started them.

```json
{
  "projects": [
    {
      "path": "~/.dotfiles/hypr/.config/hypr",
      "session_name": "hyprland",
      "listed": true
    }
  ]
}
```

This is useful for config folders, dashboards, and other targets you want permanently available.

Listed configured targets merge into tmux session results only. Herdr does not support merged lists or named-only session creation.

## Work With Different Views

The app has two main list views:

- sessions: live tmux sessions or Herdr workspaces; tmux also includes listed configured targets
- projects: scanned and matched project directories

In vim mode, view switching is always available on direct `s` and `p`, and also works through the configured prefix.

## Manage Agent Sessions

The Agents section includes tmux agent sessions (OpenCode, Pi, Codex, Claude, `tui_chat`, and related side sessions) and Herdr workspaces with detected native agent status. Herdr `unknown` status and age are hidden.

- vim mode: `o`
- standard mode: `prefix + o`

From there you can inspect, rename, or kill tmux agent sessions without leaving the picker. OpenCode rows still show OpenCode stats; other agents use the normal session details panel.

Herdr agent details are read-only: named Herdr sessions and agent controls are not supported.

## Install From Source

If you want the compiled standalone binary, build from source.

Prerequisites:

- [Bun](https://bun.sh)
- [Zig](https://ziglang.org) for compiling OpenTUI

```bash
git clone https://github.com/quiet-ghost/mux-sesh.git
cd mux-sesh
bun install
bun run build
```

The compiled binary is written to `dist/mux-sesh`.
