# Agent guide for mux-sesh

mux-sesh is an OpenTUI (React) picker for tmux sessions and Herdr workspaces, run on Bun.
User docs live in `README.md` and `docs/`; design notes in `docs/impl/`.

## Safety (read first)

mux-sesh drives real multiplexers. A test or script that inherits your terminal's session can
attach to, rename or close the user's live tmux, Herdr or Rex work.

- Run every command that executes repo code (`bun test`, `bun run …`, `bun src/…`, `bun tools/…`)
  with the multiplexer variables unset, written out in full:
  `env -u HERDR_ENV -u HERDR_SOCKET_PATH -u HERDR_WORKSPACE_ID -u HERDR_PANE_ID -u HERDR_TAB_ID -u HERDR_BIN_PATH -u TMUX -u TMUX_PANE bun test`
- Never run `herdr`, `tmux` or `rex` against a live server. Tests that need tmux start a
  disposable `tmux -L <name> -f /dev/null` server and kill it afterwards.
- Use a temp `HOME` and `XDG_*` dirs. `tests/preload.ts` does this for `bun test`; the `dev:*`
  screens use throwaway XDG config and state. `bun run dev` and `start` use the real config, so
  don't run them yourself. Never read or write `~/.config/mux-sesh`.
- Never publish to npm, push, or tag.

## Commands

Bun only: `bun`, `bun test`, `bun install`, `bun run <script>`, `bunx`. Bun loads `.env` itself.

| Command                                                        | What it does                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `bun run typecheck`                                            | `tsc` for `src` plus `tools/build`, `tools/dev`, `tools/schema`     |
| `bun run typecheck:tests`                                      | `tsc` for `tests/`                                                  |
| `bun run lint`                                                 | type-aware oxlint with the anti-slop plugins, `--deny-warnings`     |
| `bun run format` / `bun run format:check`                      | Prettier write / check                                              |
| `bun test`                                                     | full suite (preload sets a temp HOME/XDG, restores spawn and fetch) |
| `bun run bench:picker`                                         | picker perf baseline as JSON (`tests/perf/run-baseline.ts`)         |
| `bun run dev`                                                  | run from source with `MUX_SESH_DEV=1` (real config: user only)      |
| `bun run dev:config-error` / `dev:backend-error` / `dev:crash` | open one failure screen with throwaway config and state             |
| `bun run build` / `build:all`                                  | compile the binary for this host / every target into `dist/`        |
| `bun run pack`                                                 | assemble the npm packages from compiled binaries                    |
| `bun run smoke:binary`                                         | compile and launch the binary in a sandbox                          |
| `bun run schema`                                               | regenerate `mux-sesh.schema.json`                                   |

Build only when you need the compiled binary; TypeScript changes need only typecheck and tests.

Opt-in suites (skipped by default; each needs its env flag set to `1`):

- `MUX_SESH_TERMINAL_TESTS` — `tests/terminal-handoff.test.ts` (disposable tmux server)
- `MUX_SESH_PROCESS_TESTS` — `tests/signal-ownership.test.ts` (starts the real entry point)
- `MUX_SESH_HERDR_SCHEMA_TESTS` — `tests/backend-conformance-schema.test.ts` (needs `herdr` on PATH)
- `MUX_SESH_BINARY_SMOKE` — `tests/compiled-binary.test.ts` (compiles a ~140 MB binary)

Before finishing a change: typecheck, typecheck:tests, lint (0 findings), `bunx prettier --check .`,
`git diff --check`, `bun test`.

## Source map (`src/`)

- `index.tsx` → `app.tsx`: renderer setup, crash and failure screens.
- `app/` — the controller and everything it orchestrates.
  - `controller.ts`: `useAppController(cwd, services)`, the single owner of app state.
  - `app-services.ts`: `AppServices`, every side effect the controller reaches (config I/O,
    startup, clone, launcher, project discovery, open history, theme, updates, defects).
    `APP_SERVICES` is the production set; tests pass their own.
  - `keyboard/`: per-mode key handlers (`normal`, `search`, `new-session`, `agents`, modals),
    wired by `use-app-keyboard.ts`.
  - `action-catalog.ts`: every user action, its keys and footer hint. `app-mode.ts`: `AppMode`, `ViewMode`.
  - `session-inventory.ts`, `inspector.ts`, `launcher-query.ts`: single-flight inventory, preview
    and query work. `screen.tsx` and `modals-layer.tsx` render.
- `settings/` — settings catalog, editing, validation and search.
- `config/` — `config-model.ts` (the `Config` type), normalize, load/save, paths, session rules.
- `projects/` — project discovery, zoxide, project items, session links.
- `sessions/` — launch, clone and cleanup plans, session filters.
- `multiplexer/` — backend interface (`types.ts`), resolution, tmux backend, item mapping.
  `herdr/` — the Herdr backend and its protocol.
- `items/` — the `Item` type (`item.ts`), ordering, session groups.
- `search/` — matcher and filter (run on every keystroke), frecency, native file search (`fff.ts`).
- `diagnostics/` — error text, clipboard and browser hand-offs. `lifecycle/` — shutdown and teardown.
- `ui/` — presentational components. `styles/` — theme model, resolution, bundled theme data.
- `update/` — auto-update, install detection, `update-event.ts`. `util/` — small shared helpers.

Types live with their domain; there is no shared `types` module. Don't add barrels that pull
loaders into modules that only need a type.

## Testing conventions

- Screen tests render the real controller through `tests/fixtures/session-screen.tsx`
  (`renderSessionScreen`), injecting fakes through `AppServices`, not by patching modules.
- Fakes: `tests/fixtures/fake-backend.ts`, `fake-native-finder.ts`, `herdr-simulator.ts`.
- Wait with `waitForFrame` from `tests/fixtures/wait.ts`: bounded by the wall clock, not ticks.
  `settleTicks` only drains queued callbacks.
- No module mocking (`mock.module` is a lint error). Inject a dependency instead.
- Reproduce a bug in a test before fixing it. The TUI hides `console.log`; ask the user to run the
  app if you need to see live output.

## Code style (enforced)

- Prettier: `semi: false`, `singleQuote`, `printWidth: 100`, `trailingComma: es5`, `arrowParens: avoid`.
- `.oxlintrc.json`: no `any` flows (`no-unsafe-*`), no `!`, no unsafe or chained type assertions
  (an assertion needs a safety comment), exhaustive switches, no floating or misused promises,
  plus the anti-slop rules in `tools/oxlint/anti-slop` (no module mocking, no object parameters,
  no `unknown` params/returns/aliases, no runtime `typeof`, readable spacing, and more).
- `import type` for type-only imports. Comments explain why; no JSDoc.
- Prefer errors as values and discriminated unions; user-facing errors say what happened and what to do.

## Performance guardrails

Baseline: `docs/impl/session-rework/performance-baseline.md`. Run `bun run bench:picker` before
and after changes to startup, inventory, preview, search or the import graph.

- `@ff-labs/fff-bun` loads only via `await import` in `src/search/fff.ts`. Keep it dynamic and
  don't import its values at startup.
- Startup imports nearly all of `src` eagerly, including the theme data in `styles/opencode-*.ts`.
  Don't add eager imports; `config/` must not import the theme catalog.
- Work-count tests (`tests/perf.test.ts`, `tests/picker-baseline.test.ts`,
  `tests/work-budgets.test.tsx`, `tests/session-viewport-budget.test.ts`) pin the work per frame,
  e.g. one inventory request and one preview read on first frame. Don't loosen them to pass.
- `util/truncate.ts` keeps its printable-ASCII fast path.
