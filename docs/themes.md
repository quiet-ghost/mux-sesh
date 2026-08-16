# Themes

Change the mux-sesh theme from the TUI. You do not need to edit `config.json` for day-to-day switching.

## Switch Theme

1. Press `Ctrl+P`
2. Type `theme`
3. Enter on **Themes**
4. Move to preview. Enter saves. Esc restores the previous theme.

Settings → Theme opens the same list.

The picker includes built-in catalog ids, custom `themes` ids, and **System**. There is no `omarchy` option. Omarchy is how System resolves on Omarchy machines.

## System

`theme: "system"` follows the desktop or terminal.

Resolution order:

1. Omarchy `~/.local/state/omarchy/current/theme/colors.toml` when present
2. The terminal palette (OpenTUI OSC)
3. Rose Pine, using `COLORFGBG` / `color_scheme` for light vs dark

Named catalog ids stay pinned. They do not follow desktop or terminal changes.

## Color Scheme

`color_scheme` is separate from `theme`:

| Value    | Effect                                      |
| -------- | ------------------------------------------- |
| `system` | Follow Omarchy `mode` or the terminal mode  |
| `dark`   | Lock reported mode to dark                  |
| `light`  | Lock reported mode to light                 |

A locked scheme does not invent the opposite Omarchy palette. System still uses the current desktop or terminal colors.

## Omarchy Follow

With **System** selected on Omarchy, a running mux-sesh retints when the desktop theme changes. Config is not rewritten.

Follow uses two triggers:

- Watch `~/.local/state/omarchy/current/theme.name` (automatic)
- `SIGUSR2` (optional hook)

`omarchy theme set` already updates `theme.name`. The hook is only needed if you want an extra ping, for example after a custom refresh path.

Install the example hook:

```bash
omarchy hook install theme-set docs/omarchy-theme-hook.example
```

Or copy it to `~/.config/omarchy/hooks/theme-set.d/` and make it executable.

## Custom Themes

Add entries under `themes` in `config.json`. They appear in the picker by id.

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

The default theme remains `rosepine`.
