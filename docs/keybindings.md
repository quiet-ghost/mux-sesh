# Keybindings

`mux-sesh` supports two input styles: `vim` and `standard`.

Defaults:

- mode: `vim`
- prefix: `ctrl+x`

## Vim Mode

Vim mode keeps common actions on direct keys.

| Key         | Action                                       |
| ----------- | -------------------------------------------- |
| `j` / `k`   | Move down or up                              |
| `Enter`     | Attach to a session or create from a project |
| `i`         | Enter search mode                            |
| `n`         | Enter new-session mode                       |
| `o`         | Open agent sessions                          |
| `d`         | Kill selected live session                   |
| `1-9`       | Quick select visible rows                    |
| `Ctrl+P`    | Open the command palette                     |
| `q` / `Esc` | Quit                                         |

## Prefix Actions In Vim Mode

When a prefix key is configured, secondary actions are also available behind that prefix. With the default config, these are `ctrl+x` combinations.

| Prefix + key | Action                                           |
| ------------ | ------------------------------------------------ |
| `s`          | Switch to sessions view                          |
| `p`          | Switch to projects view                          |
| `r`          | Rename selected live session                     |
| `d`          | Kill selected live session                       |
| `l`          | Jump to the previous tmux session                |
| `g`          | Open the git-root session for the selected item  |
| `e`          | Edit the configured target for the selected item |
| `Shift+R`    | Refresh sessions and projects                    |

In vim mode, `s` and `p` also work directly even when a prefix key is configured.

## Vim Mode Without A Prefix

If `prefix_key` is unset, a subset of actions becomes direct again:

| Key | Action                        |
| --- | ----------------------------- |
| `l` | Previous tmux session         |
| `g` | Git-root session              |
| `e` | Edit configured target        |
| `r` | Rename selected live session  |
| `R` | Refresh sessions and projects |

## Search Mode

Search mode is explicit in vim mode and continuous in standard mode.

| Key       | Action                                                       |
| --------- | ------------------------------------------------------------ |
| Type      | Filter results                                               |
| `Enter`   | Select the first result                                      |
| `↑` / `↓` | Move through results                                         |
| `Esc`     | Exit search in vim mode, or clear the query in standard mode |

## Standard Mode

Standard mode is search-first. The query stays active, arrow keys handle movement, and the prefix key becomes the main command layer.

| Key       | Action                   |
| --------- | ------------------------ |
| Type      | Filter immediately       |
| `↑` / `↓` | Move through results     |
| `Enter`   | Select the first result  |
| `Esc`     | Clear the current search |
| `Ctrl+Q`  | Quit                     |
| `Ctrl+P`  | Open the command palette |

## Prefix Actions In Standard Mode

| Prefix + key | Action                        |
| ------------ | ----------------------------- |
| `n`          | New session                   |
| `o`          | Open agent sessions           |
| `s`          | Open settings                 |
| `l`          | Previous tmux session         |
| `g`          | Git-root session              |
| `r`          | Rename selected live session  |
| `d`          | Kill selected live session    |
| `Shift+R`    | Refresh sessions and projects |

## New-Session Mode

Use new-session mode to create from a discovered project, a configured target, a custom name, or a GitHub URL.

| Key              | Action                                           |
| ---------------- | ------------------------------------------------ |
| Type             | Filter candidate projects or enter a custom name |
| Paste GitHub URL | Clone and create a session                       |
| `Enter`          | Confirm selection                                |
| `↑` / `↓`        | Move through candidates                          |
| `Esc`            | Cancel                                           |

In standard mode, `Ctrl+I` returns from new-session mode to search, and `Ctrl+D` can kill a selected live session if one is focused.

## Agent Sessions

Agent sessions have their own manage view. Matching names include `opencode-*`, `pi-*`, `codex-*`, `claude-*`, and `tui_chat`.

| Key                    | Action                                                     |
| ---------------------- | ---------------------------------------------------------- |
| `j` / `k` or `↑` / `↓` | Move                                                       |
| `d`                    | Kill selected agent session in vim mode                    |
| `r`                    | Rename selected agent session when no prefix is configured |
| `Ctrl+P`               | Open the command palette                                   |
| `Esc`                  | Leave the agent sessions view                              |

With a prefix configured, agent session actions follow the prefix as well:

- `prefix + o` back
- `prefix + d` kill
- `prefix + r` rename

## Command Palette And Settings

The command palette is available with `Ctrl+P`.

Inside the command palette or settings screen:

| Key       | Action      |
| --------- | ----------- |
| `↑` / `↓` | Move        |
| `Enter`   | Run or open |
| `Esc`     | Close       |

In standard mode, opening settings directly is also available as `prefix + s`.
