# Dynamic TUI + system themes

Implementation guides for following the desktop/terminal theme from mux-sesh, without hand-editing `config.json`.

## Product decisions (locked)

* **No** `omarchy` **theme id.** The picker has one special id: `system`.
* `theme: "system"` auto-detects: Omarchy `colors.toml` if present, otherwise terminal palette / `COLORFGBG` (P4).
* Named catalog ids pin a mux-sesh theme and do **not** follow desktop changes.
* `color_scheme: dark|light` locks mode. `color_scheme: system` follows Omarchy `mode` / terminal mode.
* Users must not need to hand-edit `config.json` for day-to-day theme changes.
* Searching the command palette for `theme` must open a theme picker.

## Phases

1. DEV-95 — Command-palette Themes picker — `p1-picker.md`
2. DEV-96 — `system` reads Omarchy `colors.toml` — `p2-omarchy-resolve.md`
3. DEV-97 — Live follow while `theme=system` — `p3-live-follow.md` (watch `theme.name` + SIGUSR2; named themes stay pinned)
4. DEV-98 — Terminal palette when Omarchy is absent — `p4-terminal-palette.md` (OpenTUI OSC / COLORFGBG; Omarchy still wins)
5. DEV-99 — User-facing docs — `p5-user-docs.md`

Do P1 first. P2 is blocked by P1. P3 and P4 are blocked by P2. P5 should land after the behavior exists.

## What already works

Settings → Theme already writes `~/.config/mux-sesh/config.json` and recolors immediately. P1 adds custom/`system` ids and a command-palette Themes row. Gaps after P1: `system` still falls back to Rose Pine; no Omarchy palette; no live desktop follow.

## Research notes

* Omarchy writes `~/.local/state/omarchy/current/theme.name` (overwrite in place) and replaces the `theme/` directory on every `omarchy theme set`.
* Watch `theme.name`, never `theme/colors.toml` (that inode dies).
* OpenCode follows the terminal via OSC/CSI + `SIGUSR2`. It does not read Omarchy.
* mux-sesh paints its own `ThemeColors`, so terminal OSC/SIGWINCH alone is not enough.
