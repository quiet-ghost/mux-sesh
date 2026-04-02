# Workflows

This page covers the common ways to use `mux-sesh` day to day.

## Open mux-sesh Inside tmux

The smoothest setup is a popup binding.

```tmux
bind-key -n M-w popup -E -w 62% -h 70% "mux-sesh"
```

Reload tmux after updating your config:

```bash
tmux source-file ~/.tmux.conf
```

## Switch To Something Already Running

Use the sessions view when the target tmux session already exists.

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

If the project is already linked to a tmux session, mux-sesh attaches to it. Otherwise it creates a new session.

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

These actions are useful when a project is already part of a broader tmux workflow.

- previous session: `prefix + l`, or direct `l` when no prefix is configured in vim mode
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

## Work With Different Views

The app has two main list views:

- sessions: live tmux sessions and listed configured targets
- projects: scanned and matched project directories

In vim mode, view switching is always available on direct `s` and `p`, and also works through the configured prefix.

## Manage OpenCode Sessions

OpenCode sessions live in their own view.

- vim mode: `o`
- standard mode: `prefix + o`

From there you can inspect, rename, or kill OpenCode-managed sessions without leaving the picker.

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
