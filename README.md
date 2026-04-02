# mux-sesh

Fast tmux session switching and project launching from a polished terminal UI.

<p align="center">
  <img src="screenshot.png" alt="mux-sesh screenshot" width="800">
</p>

## Why mux-sesh

- Switch to live tmux sessions without leaving the keyboard.
- Launch local projects from a single, searchable picker.
- Keep reusable project rules in config instead of shell scripts.
- Stay inside tmux with previews, quick actions, and lightweight workflows.

## Quick Start

`mux-sesh` runs on Bun and talks directly to tmux.

Prerequisites:

- [Bun](https://bun.sh)
- [tmux](https://github.com/tmux/tmux/wiki)
- [git](https://git-scm.com) for cloning GitHub repositories from the new-session flow

Install globally:

```bash
bun install -g mux-sesh
```

Run it:

```bash
mux-sesh
```

Recommended tmux binding:

```tmux
bind-key -n M-w popup -E -w 62% -h 70% "mux-sesh"
```

Reload tmux after adding the binding:

```bash
tmux source-file ~/.tmux.conf
```

## How It Works

- Sessions view shows live tmux sessions.
- Projects view shows scanned or configured directories.
- Selecting a project attaches to an existing session when possible, or creates one.
- The new-session flow can also clone a GitHub repository into your configured repos directory.

## Minimal Configuration

Config lives at `~/.config/mux-sesh/config.json`.

```json
{
  "project_paths": ["~/dev", "~/personal"],
  "repos_path": "~/dev/repos",
  "keybind_mode": "vim",
  "prefix_key": "ctrl+x",
  "theme": "rosepine",
  "default_session": {
    "startup_command": "nvim"
  }
}
```

Full configuration reference: [docs/configuration.md](docs/configuration.md)

## Essential Keys

Default mode is `vim`.

| Key         | Action                |
| ----------- | --------------------- |
| `j` / `k`   | Move                  |
| `Enter`     | Attach or create      |
| `i`         | Search                |
| `n`         | New session           |
| `d`         | Kill selected session |
| `1-9`       | Quick select          |
| `Ctrl+P`    | Open command palette  |
| `q` / `Esc` | Quit                  |

With the default prefix key, secondary actions live behind `ctrl+x`:

- `ctrl+x s` sessions
- `ctrl+x p` projects
- `ctrl+x l` last session
- `ctrl+x g` git root session
- `ctrl+x r` rename session
- `ctrl+x e` edit configured target
- `ctrl+x Shift+R` refresh

In vim mode, `s` and `p` are also available as direct view switches.

Full keybinding reference: [docs/keybindings.md](docs/keybindings.md)

## Docs

- [Configuration](docs/configuration.md)
- [Keybindings](docs/keybindings.md)
- [Workflows](docs/workflows.md)

## Development

```bash
bun install
bun run typecheck
bun test
```

Use `bun run build` only when you need the compiled binary in `dist/mux-sesh`.

## License

MIT. See [LICENSE](LICENSE).

## Related

- [mux-manager](https://github.com/quiet-ghost/mux-manager) for Telescope-based tmux session management inside Neovim
- Built with [OpenTUI](https://github.com/anomalyco/opentui)
