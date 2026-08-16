# P3: Live-follow Omarchy while theme=system

Repo source: `docs/impl/dynamic-themes/p3-live-follow.md`

Blocked by P2. Linear: DEV-97.

## Goal

If the user picked **System**, a running mux-sesh must retint when Omarchy changes theme. No restart. No rewrite of `config.json`.

Named catalog themes stay pinned. `color_scheme: dark|light` stays locked.

## Triggers (both)

1. **SIGUSR2** — a hook can `killall -SIGUSR2 mux-sesh`.
2. **Watch** `theme.name` — overwritten in place. Hooks do not run on `omarchy theme refresh`.

Never watch `theme/colors.toml`. That directory is deleted and replaced every set.

`src/index.tsx` must ignore unhandled SIGUSR2 so a named theme does not die on `killall -SIGUSR2 mux-sesh`. Follow still only retints when `config.theme === 'system'`.

## Done when

* System theme follows Omarchy live
* Named themes do not retint
* SIGUSR2 is not shutdown
* Config file is not rewritten on desktop theme change
* `bun test` and `bun run typecheck` pass
