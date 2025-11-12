# mux-sesh

> A beautiful, fast tmux session manager built with OpenTUI and TypeScript

<p align="center">
  <img src="screenshot.png" alt="mux-sesh screenshot" width="800">
</p>

## Features

-  **Fuzzy search** - Find sessions and projects instantly
-  **Lightning fast** - Built with Bun and OpenTUI
-  **Beautiful UI** - Catppuccin-themed interface
-  **Vim keybindings** - Navigate with j/k or arrow keys
-  **Project scanning** - Browse and create sessions from local directories
-  **GitHub integration** - Clone repos directly from URLs
-  **Quick select** - Use number keys (1-9) for instant switching
-  **Session management** - Create, switch, kill, and rename sessions

## Installation

### Prerequisites

- [Bun](https://bun.sh) - JavaScript runtime (required)
- [Zig](https://ziglang.org) - Required for building OpenTUI
- tmux - Terminal multiplexer
- git - For GitHub cloning feature

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install Zig (macOS)
brew install zig

# Install Zig (Linux - check https://ziglang.org/download/)
```

### Install from npm/Bun

```bash
bun install -g mux-sesh

# Then run
mux-sesh
```

### Install from Source

```bash
git clone https://github.com/quiet-ghost/mux-sesh.git
cd mux-sesh
git checkout opentui-convert

# Install dependencies
bun install

# Build standalone executable
bun run build

# Install globally
sudo cp dist/mux-sesh /usr/local/bin/
# or
cp dist/mux-sesh ~/.local/bin/
```

## Keybindings

### Normal Mode
| Key | Action |
|-----|--------|
| `j` / `k` or `↑` / `↓` | Navigate up/down |
| `1-9` | Quick select session/project |
| `Enter` | Switch to session / Create from project |
| `i` | Enter search mode |
| `n` | Create new session |
| `d` | Kill selected session |
| `r` | Rename selected session |
| `R` | Refresh list |
| `s` | Switch to sessions view |
| `p` | Switch to projects view |
| `q` or `Esc` | Quit |

### Search Mode
| Key | Action |
|-----|--------|
| Type to search | Filter sessions/projects |
| `Enter` | Select first result |
| `↑` / `↓` | Navigate results |
| `Esc` | Cancel search |

### New Session Mode
| Key | Action |
|-----|--------|
| Type project name | Filter projects |
| Paste GitHub URL | Clone and create session |
| Type custom name | Create named session |
| `Enter` | Confirm selection |
| `Esc` | Cancel |

## Configuration

Configuration is stored at `~/.config/mux-sesh/config.json`:

```json
{
  "projectPaths": ["~/dev", "~/personal", "~/work"],
  "reposPath": "~/dev/repos",
  "editor": "nvim",
  "editorCmd": "nvim -c \"lua vim.defer_fn(function() if pcall(require, 'telescope') then vim.cmd('Telescope find_files') end end, 100)\""
}
```

### Configuration Options

- **`projectPaths`** - Array of directories to scan for projects
- **`reposPath`** - Directory where GitHub repositories will be cloned
- **`editor`** - Default editor to use
- **`editorCmd`** - Command to run when opening editor

## Usage Examples

### Quick Session Switching
```bash
# Open mux-sesh
mux-sesh

# Press 1-9 to instantly switch to that session
# Or use j/k to navigate and Enter to select
```

### Create Session from Project
```bash
mux-sesh

# Press 'n' for new session
# Type project name to filter
# Press Enter to create session in that directory
```

### Clone from GitHub
```bash
mux-sesh

# Press 'n' for new session
# Paste GitHub URL:
#   https://github.com/user/repo
#   or
#   git@github.com:user/repo.git
# Press Enter to clone and create session
```

### Search Existing Sessions
```bash
mux-sesh

# Press 'i' to search
# Type to filter sessions
# Press Enter to switch to first match
```

## Color Scheme

mux-sesh uses the beautiful [Catppuccin](https://github.com/catppuccin/catppuccin) color scheme with the following palette:

- **Primary**: `#f38ba8` (Pink)
- **Active**: `#a6e3a1` (Green)
- **Inactive**: `#6c7086` (Gray)
- **Border**: `#89b4fa` (Blue)
- **Key**: `#f9e2af` (Yellow)
- **Action**: `#cba6f7` (Mauve)

 **Cross-Platform** - Works on Linux, macOS, Windows

##  Development

```bash
# Install dependencies
bun install

# Run in dev mode (with hot reload)
bun run dev

# Type check
bun run typecheck

# Build for production
bun run build
```

##  Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

##  License

MIT License - see [LICENSE](./LICENSE) for details.

##  Acknowledgments

- Inspired by [ThePrimeagen's tmux-sessionizer](https://github.com/ThePrimeagen/.dotfiles/blob/master/bin/.local/scripts/tmux-sessionizer)
- Built with [OpenTUI](https://github.com/sst/opentui)
- UI design inspired by [nvim telescope plugin](https://github.com/nvim-telescope/telescope.nvim)

##  Related Projects

- [mux-manager](https://github.com/quiet-ghost/mux-manager) - Telescope-based tmux session manager for Neovim

---

<p align="center">
  Made with using <a href="https://github.com/sst/opentui">OpenTUI</a> and <a href="https://bun.sh">Bun</a>
</p>
