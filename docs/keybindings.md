# Keybindings

`mux-sesh` has two input styles, set with `keybind_mode`: `vim` (the default) and `standard`.
Secondary actions sit behind `prefix_key`, which defaults to `ctrl+x`. The tables below use the
default prefix; replace `ctrl+x` with your own `prefix_key` if you changed it.

Keys are written the way the footer and the command palette show them. The footer shows each
action before its key, such as `search i` or `commands ctrl+p`. Screen actions sit on the left
and actions on the selected row sit on the right, next to the version. The footer lists only
actions that are available right now, and an unavailable key says why instead of doing
something else. Every action is also in the command palette (`ctrl+p`, everywhere except the
New screen), which lists every key of an action, such as `d / ctrl+x d`. While the prefix key
waits for its second key, the footer shows `prefix ctrl+x …`.

The action tables on this page are checked against the action catalog by the test suite.

## Focus

- Where a text field has focus (search, New, rename, palette, settings, theme picker), letters
  and digits type into the field. Only non-text keys such as arrows, `enter`, `esc`, and
  `ctrl+…` combinations act.
- In vim mode the main list has no text field, so single letters are commands.
- In dialogs, `↑` / `↓` move, `enter` confirms, and `esc` cancels or goes back.

## Feedback

- Confirmations, refusals, and failures replace the footer hints for a moment. The first word
  says the kind: `done`, `warn` (a refusal that changed nothing), `error`, or `info`. The version
  stays at the right. A message too long for one row continues below it, up to three rows.
- A notice leaves after 5 seconds and the hints return. An error stays for 8 seconds or until the
  next key, as `any key` at its right says; newer notices wait behind it, counted as `+N more`.
- A stale session list (`stale`) or degraded file search (`warn`) stays on the line above the
  footer until it recovers.

## Vim Mode

<!-- keys: vim normal -->

| Key              | Action                                                                |
| ---------------- | --------------------------------------------------------------------- |
| `enter`          | Open the selected row: focus a live session, or create from a project |
| `i`              | Search                                                                |
| `n`              | New session (the project-first launcher)                              |
| `o`              | Agents, when agent rows are listed in the sessions view               |
| `d` / `ctrl+x d` | Close: review the selected live session, or the marked rows           |
| `m` / `ctrl+x m` | Mark or unmark the selected row for a batch close                     |
| `v` / `ctrl+x v` | Toggle details                                                        |
| `ctrl+f`         | Pin or unpin the selected session (sessions view)                     |
| `s` / `ctrl+x s` | Show sessions                                                         |
| `p` / `ctrl+x p` | Show projects                                                         |
| `ctrl+x r`       | Rename the selected live session                                      |
| `ctrl+x l`       | Last session (tmux only; Herdr does not track the previous workspace) |
| `ctrl+x g`       | Root session: open the git root of the selected row                   |
| `ctrl+x e`       | Edit target: open a listed configured target in your `editor`         |
| `ctrl+x shift+r` | Refresh sessions and projects                                         |
| `ctrl+p`         | Command palette                                                       |

Also in vim mode:

| Key                    | Action                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| `j` / `k` or `↑` / `↓` | Move                                                                   |
| `1`–`9`                | Open the matching visible row; a project row opens as `enter` plans it |
| `q` / `esc`            | Quit                                                                   |

### Vim Search

`i` opens search; the query field then has focus.

<!-- keys: vim search -->

| Key      | Action                   |
| -------- | ------------------------ |
| `enter`  | Open the highlighted row |
| `ctrl+p` | Command palette          |

Type to filter, `↑` / `↓` to move, and `esc` to leave search and clear the query.

## Standard Mode

Standard mode is search-first: the query field always has focus, arrows move, and the prefix key
is the command layer.

<!-- keys: standard search -->

| Key              | Action                                                      |
| ---------------- | ----------------------------------------------------------- |
| `enter`          | Open the highlighted row                                    |
| `ctrl+x n`       | New session (the project-first launcher)                    |
| `ctrl+x o`       | Agents, when agent rows are listed in the sessions view     |
| `ctrl+x d`       | Close: review the selected live session, or the marked rows |
| `ctrl+x m`       | Mark or unmark the selected row for a batch close           |
| `ctrl+x v`       | Toggle details                                              |
| `ctrl+x s`       | Open settings                                               |
| `ctrl+x r`       | Rename the selected live session                            |
| `ctrl+x l`       | Last session (tmux only)                                    |
| `ctrl+x g`       | Root session: open the git root of the selected row         |
| `ctrl+x shift+r` | Refresh sessions and projects                               |
| `ctrl+p`         | Command palette                                             |

Type to filter, `↑` / `↓` to move, `esc` to clear the query, and `ctrl+q` to quit. Standard mode
has no key for pinning, switching to projects, editing a configured target, or themes; run them
from the command palette.

## New Session

`n` (vim) or `ctrl+x n` (standard) opens the project-first launcher with the first project
selected. A summary row above the list names exactly what `enter` will do, and the footer shows
it as `create enter`, `focus enter`, or `clone enter`.

<!-- keys: vim new -->

| Key      | Action                                                         |
| -------- | -------------------------------------------------------------- |
| `enter`  | Run what the summary row says: create, focus, or clone         |
| `ctrl+n` | Name: edit the name of the session about to be created         |
| `ctrl+t` | Startup: edit its startup command; empty runs nothing          |
| `ctrl+g` | Here: create a named session in the directory you started from |
| `ctrl+o` | File: search for a file, or type its path, and open it         |

In standard mode New has two more keys:

<!-- keys: standard new -->

| Key      | Action                                                         |
| -------- | -------------------------------------------------------------- |
| `enter`  | Run what the summary row says: create, focus, or clone         |
| `ctrl+n` | Name: edit the name of the session about to be created         |
| `ctrl+t` | Startup: edit its startup command; empty runs nothing          |
| `ctrl+g` | Here: create a named session in the directory you started from |
| `ctrl+o` | File: search for a file, or type its path, and open it         |
| `ctrl+i` | Back to search                                                 |
| `ctrl+d` | Close: review the selected live session, or the marked rows    |

Type to filter projects, `↑` / `↓` to move, and `esc` to cancel. Inside a step, `enter` applies
or opens, and `esc` returns to the project list with its query and selection unchanged.
`ctrl+n` and `ctrl+t` are offered only when the selected row would create a session; they are not
offered for a live session, a typed path, or a GitHub URL. See [workflows.md](workflows.md).

## Agents

<!-- keys: vim agents -->

| Key                | Action                                                            |
| ------------------ | ----------------------------------------------------------------- |
| `esc` / `ctrl+x o` | Back                                                              |
| `enter`            | Focus the selected agent                                          |
| `d` / `ctrl+x d`   | Close: review the selected tmux agent session, or the marked rows |
| `m` / `ctrl+x m`   | Mark or unmark the selected row                                   |
| `v` / `ctrl+x v`   | Toggle details                                                    |
| `ctrl+x r`         | Rename the selected tmux agent session                            |
| `ctrl+p`           | Command palette                                                   |

<!-- keys: standard agents -->

| Key                | Action                                                            |
| ------------------ | ----------------------------------------------------------------- |
| `esc` / `ctrl+x o` | Back                                                              |
| `enter`            | Focus the selected agent                                          |
| `ctrl+x d`         | Close: review the selected tmux agent session, or the marked rows |
| `ctrl+x m`         | Mark or unmark the selected row                                   |
| `ctrl+x v`         | Toggle details                                                    |
| `ctrl+x r`         | Rename the selected tmux agent session                            |
| `ctrl+p`           | Command palette                                                   |

`↑` / `↓` move (also `j` / `k` in vim mode). Herdr agent rows are panes inside a workspace: they
can be focused and inspected, but rename and close are unavailable and say to use Herdr instead.

## Dialogs

| Dialog                    | Keys                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| Command palette, settings | Type to filter, `↑` / `↓` move, `enter` runs or opens, `esc` closes        |
| Theme picker              | `↑` / `↓` preview, `enter` saves, `esc` restores the saved theme           |
| Rename                    | Type the name, `enter` renames, `esc` cancels                              |
| Close review              | `enter` closes exactly what is shown, `esc` keeps it                       |
| Close results             | `enter` retries what is still open (or closes the dialog), `esc` closes    |
| Operation report          | `enter` retries when the footer offers it (otherwise closes), `esc` closes |
| Startup failure           | `r` retries, `q` / `esc` / `ctrl+c` quit                                   |
| Crash recovery            | See [Crash Recovery](workflows.md#crash-recovery)                          |
