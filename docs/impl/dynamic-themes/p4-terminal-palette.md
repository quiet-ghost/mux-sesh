# P4: System theme from terminal palette when Omarchy is absent

Repo source: `docs/impl/dynamic-themes/p4-terminal-palette.md`

Blocked by P2. Linear: DEV-98.

## Goal

On machines without Omarchy, `theme: "system"` should still look like the terminal. If Omarchy `colors.toml` is present, P2/P3 win.

## Resolution order

1. Omarchy palette if present
2. Injected terminal palette (OpenTUI OSC / `getPalette`)
3. Rose Pine + `getSystemColorScheme()`
4. Named catalog / custom

`resolveTheme` stays synchronous. The renderer hook feeds a parsed palette into the options bag.

## Done when

* Without Omarchy files, System still produces a coherent theme from the terminal palette
* With Omarchy files, the terminal palette is ignored
* `bun test` and `bun run typecheck` pass
