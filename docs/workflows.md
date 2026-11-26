# Workflows

This page covers the common ways to use `mux-sesh` with tmux sessions or Herdr 0.7.5 or newer
workspaces. Keys are shown for vim mode with the default `ctrl+x` prefix; the standard-mode keys
are in [keybindings.md](keybindings.md).

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

New's "here" step creates a session in the directory mux-sesh was started in. To make that the
current pane's directory, add `-d "#{pane_current_path}"` to the popup command.

## Open mux-sesh With Herdr

Run mux-sesh inside Herdr or while its server is already running. No Herdr plugin is needed.

```bash
herdr status
mux-sesh
```

Herdr workspaces, tabs, and panes appear as sessions, windows, and panes. See
[Backend Selection](configuration.md#backend-selection) for how mux-sesh picks a backend.

## If mux-sesh Cannot Start

When the config is invalid, the backend is unusable, or the session list cannot be read,
mux-sesh shows a startup screen naming the stage that failed and what to do. Invalid config
fields are listed by path, without their values, and the file is not changed. mux-sesh never
starts or switches a backend for you. Fix the cause, then press `r` to retry; `q`, `esc`, or
`ctrl+c` quit.

## Switch To Something Already Running

Use the sessions view when the target tmux session or Herdr workspace already exists.

```text
j / k to move
enter to focus it
1-9 to open a visible row directly
```

## Search

In vim mode, search is explicit:

```text
i
type a query
enter
```

In standard mode, search is always active:

```text
type a query
enter
esc to clear
```

## Create A Session From A Project

`n` opens New, a project-first launcher, with the first project selected. Type to narrow the
list. A summary row above the list says exactly what `enter` will do, for example
`Create 'api' in ~/dev/api, then run: bun dev`, and the footer shows `enter create`,
`enter focus`, or `enter clone`. `enter` runs that plan and nothing else.

```text
n
type to narrow the list
enter
```

- A project with a live session or workspace in the same directory is focused, not created again.
- In tmux, a session name already used for another directory is refused; nothing is opened.
- Text that matches no project never creates a session named after it. Use the "here" step below.
- A typed path starting with `/`, `~`, or `./` opens that directory or file when it exists; the
  summary row shows what `enter` will open instead when it does not.

Before pressing `enter`, you can change the planned session:

- `ctrl+n` edits its name. An invalid name is refused and the draft is kept.
- `ctrl+t` edits its startup command. An empty command runs nothing.

Edits apply to the selected project only and are dropped when the selection changes. `esc` in a
step returns to the list unchanged.

## Create A Named Session Here

`ctrl+g` in New asks for a name and creates the session in the directory mux-sesh was started
in. If that directory no longer exists, nothing is created.

```text
n
ctrl+g
type a name
enter
```

## Open A File

`ctrl+o` in New searches files under `project_paths` as you type, powered by
[fff](https://github.com/dmtrKovalenko/fff), which runs locally. You can also type a file path.

```text
n
ctrl+o
type a file name or path
enter
```

Opening a file:

- creates a session or workspace in the file's parent directory
- opens the file with your configured `editor` (for example `nvim '/path/to/file'`)
- focuses the existing target instead if one is already running for that file
- refuses a typed path that does not exist or is a directory

The file step offers only files. If native file search is unavailable, or turned off with
`MUX_SESH_DISABLE_FFF=1`, the step says so; typed file paths still work.

To customize how files open, set a `default_session.startup_command` containing a `{file}`
placeholder:

```json
{
  "default_session": {
    "startup_command": "nvim {file}"
  }
}
```

`{dir}` is also available and expands to the file's parent directory. Both are shell-quoted.

## Clone From GitHub

New also accepts GitHub repository URLs.

```text
n
paste a GitHub URL
enter
```

Examples:

```text
https://github.com/user/repo
git@github.com:user/repo.git
```

The repository is cloned into `repos_path/<repo>`, then a session opens there. Before anything
runs, the summary row says what will happen:

- A URL that contains a username or token is refused and the token is not shown. Use the plain
  URL and let git's credential helper sign in.
- If the destination does not exist, `enter clone` clones it.
- If it exists, it is reused only after it is verified as a complete checkout of the same
  repository inside `repos_path`. Anything else (another repository, a plain directory, a link
  outside `repos_path`, a checkout with no commits) is refused and left as it is.
- The destination is checked again right before the clone runs.
- git runs without a terminal prompt, so a missing credential fails instead of hanging. SSH
  passphrases are left to your ssh agent.

mux-sesh never deletes anything at the destination. If a clone fails or does not finish, the
report says whether anything was left there. Leftovers are kept, and the next `enter` refuses to
reuse them unless they are a complete checkout; inspect or remove them yourself.

## Close Sessions

Closing is always reviewed. `d` opens a review of exactly the selected live session: its name,
path, what it contains, and warnings (attached, pinned, an agent working or waiting for input).
`enter` closes that session or workspace; `esc` keeps it. If the target changed or disappeared
since you reviewed it, nothing is closed and the review says why.

To close several at once, mark rows with `m` (marked rows are shown in the list), then press
`d` to review the marked set instead of the cursor row. Confirming closes only that reviewed set,
in order; a list refresh cannot add to it. Members that cannot be closed are listed with the
reason and left open:

- projects and other rows that are not live sessions
- Herdr agent panes (mux-sesh closes only whole workspaces)
- the session or workspace that hosts the picker; close it on its own with `d`

After a batch, a receipt lists each target as closed, failed, unfinished, or not attempted.
`enter` retries only what is still open: the list is refreshed first, and completed closes are
never repeated.

A close ends the tmux session or Herdr workspace and every pane in it. No files, worktrees, or
branches are deleted, and mux-sesh never closes anything you did not review.

## Inspect Details

At 120 columns or wider, a details panel sits beside the list. It is compact by default: moving
through the list reads nothing extra. Toggle details (`v`) to inspect the selected row: session
windows or tabs, git branch, and the project's `preview_command`. Toggle again to return to
compact. See [Preview Behavior](configuration.md#preview-behavior).

## Jump To Related Sessions

- last session: `ctrl+x l`; tmux only, because Herdr does not track the previous workspace
- root session (the git root of the selected row): `ctrl+x g`
- edit target (open a listed configured target in your `editor`): `ctrl+x e`

## Use Listed Targets

Exact project rules can stay visible in the sessions view before a session exists for them.

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

This is useful for config folders, dashboards, and other targets you want one keypress away.

## Work With Different Views

The app has two main list views:

- sessions: live tmux sessions or Herdr workspaces, plus listed configured targets
- projects: scanned and matched project directories

Switch with `s` and `p`, or `ctrl+x s` and `ctrl+x p`.

## Manage Agent Sessions

The sessions view keeps agents in their own section:

- tmux: sessions named `opencode-*`, `pi-*`, `codex-*`, `claude-*`, or `tui_chat`
- Herdr: every agent pane Herdr reports, each as its own row, including several agents in one
  tab. Herdr workspaces always stay in the regular list, whatever their label or status.
  Herdr's `unknown` status and age are hidden.

`o` (or `ctrl+x o` in standard mode) opens the agents list. `enter` focuses the agent: a tmux
agent session, or the exact Herdr agent pane. tmux agent sessions can be renamed and closed like
any session. Herdr agent panes are read-only here: rename and close say to use Herdr, and a
marked agent pane is refused in a batch close while its workspace stays open.

## Crash Recovery

mux-sesh disables OpenTUI's automatic error console so a crash cannot trap the terminal. When
the UI itself fails, a recovery screen shows a diagnostics report:

- `c` copies the report to the terminal clipboard with OSC 52; terminals do not confirm this,
  so the screen says it was sent, not that it was copied
- `o` reviews sharing first: confirming with `y` or `enter` opens a prefilled GitHub issue in
  your browser; `n` or `esc` cancels and sends nothing
- `r` retries the application UI
- `q`, `esc`, or `ctrl+c` restores the terminal and exits
- `↑` / `↓`, `j` / `k`, `pgup` / `pgdn`, `home`, and `end` scroll long reports

Common secrets and tokens are redacted, but redaction is pattern-based: read the report before
sharing it. Opening the prefilled issue sends the report to github.com and leaves it in your
browser history, even if you never submit the issue.

Uncaught errors outside the UI restore the terminal first, then print the report and issue URL
to the terminal before exiting with status 1. A process that is killed or crashes natively (for
example `SIGKILL` or a segfault) cannot show either; mux-sesh then has no chance to restore the
terminal, so run `reset` if it is left in a bad state.

## Install From Source

If you want the compiled standalone binary, build from source.

Prerequisites:

- [Bun](https://bun.sh) 1.3.14 or newer
- [Zig](https://ziglang.org) for compiling OpenTUI

```bash
git clone https://github.com/quiet-ghost/mux-sesh.git
cd mux-sesh
bun install
bun run build
```

The compiled binary is written to `dist/mux-sesh`.
