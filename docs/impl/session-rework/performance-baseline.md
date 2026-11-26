# Picker performance baseline

DEV-307 establishes the fixture baseline for the rework and DEV-347 comparison.

## Reproduce

```sh
bun install --frozen-lockfile
bun run bench:picker
```

The command prints a JSON report with versions, dimensions, warmness, timings, and work counts.
It accepts no path arguments. Native search uses a generated temporary corpus, removed after
the finder is destroyed. Work on real project roots requires a separate, explicitly approved run.

Run on the same host with other builds/tests stopped. Keep dimensions, corpus, sample counts,
and warmness fixed for comparisons; record dependency changes alongside the results.

## Scenario and measurement boundaries

- Production `AppScreen`, keyboard, filtering, and selection hooks at **120×36**, using the
  Catppuccin dark theme and ASCII fixture icons.
- **200 Herdr sessions**, one tab/pane each, named `session-000` through `session-199`.
- **5,000 cached project candidates**, named `project-00000` through `project-04999`.
- Five warmup navigation steps, then 30 measured steps. Each frame must show the expected selection.
- Open New, then five warmup query replacements and 30 measured replacements. Queries cycle through
  `project-00042`, `project-00123`, `project-01234`, `project-02500`, `project-04999`.
- Real Herdr adapter and protocol parser, backed by a recording `CommandRunner`. Its `subprocess`
  counter counts requested CLI calls; backend processes are not spawned. Preview timing measures
  adapter work with fixture replies, excluding real command/terminal transport latency.
- First usable frame covers a fresh renderer, inventory loading, and the verified selected row.
  Imports and corpus construction precede this timer. Harness import time is reported separately.
  CLI wrapper, config loading, backend probes, and project discovery are outside this fixture boundary.
- Project query-to-frame includes native textarea replacement, production filtering, React updates,
  and rendering. Discovery and FFF are separate from the cached-project scenario.
- A separate **60×18** one-agent tmux fixture (`opencode-fixture`) counts work when entering
  Agents. The narrow screen has no detail pane. The recorded run below predates DEV-310 and
  counted statistics requests through a count-only callback; the probe closed before interval polling.
- Native FFF uses **5,000 temporary project directories**, each containing `README.md`. Files are
  freshly written, so OS page cache is warm. A fresh finder disables mmap cache warmup/content indexing and omits
  frecency/history databases. Scan completion and matching results are checked; five warmup searches
  precede 30 synchronous `mixedSearch` samples with page size 60. Corpus construction, module import,
  initialization, and scan wait are outside the search timer.
- Percentiles use nearest rank. Empty samples report `null`, not zero. Renderer/input/effect and
  finder release are checked. Ordinary `bun test` verifies work counts without latency thresholds
  or native filesystem indexing.

## Recorded run

Recorded **2026-10-03T22:05:08.128Z**, DEV-307 instrumentation on top of `6941ec4`.

- Linux x64, kernel `7.2.5-3-omarchy`, AMD Ryzen 7 5800X3D.
- Bun `1.4.2`, mux-sesh `1.10.0`, React `19.2.8`.
- OpenTUI core/react `0.4.5`, FFF Bun `0.10.1`.
- 30 measured samples per warm series, after 5 warmups; one fresh-renderer/scan sample.

| Warm measurement                      | p50 (ms) | p95 (ms) |
| ------------------------------------- | -------: | -------: |
| Navigation to frame                   |    2.984 |    4.165 |
| Navigation preview, fixture transport |    0.258 |    0.461 |
| Local project filtering               |    0.879 |    2.437 |
| Project query to frame                |    2.317 |    3.642 |
| Native FFF mixed search               |    2.506 |    3.094 |

Single observations: harness import **71.112 ms**, first usable frame **63.508 ms**, cached projects
frame **32.951 ms**, native initialization/scan wait **51.169 ms**. Native indexing confirmed 5,000
files and 5,000 directories. Both renderer/effects and native finder reported released resources.

Work counts below exclude warmup requests:

| Phase                | Navigation | Inventory | Search | Preview | Statistics | Recorded CLI calls |
| -------------------- | ---------: | --------: | -----: | ------: | ---------: | -----------------: |
| First frame          |          0 |         1 |      0 |       1 |          0 |                  2 |
| Navigation           |         30 |         0 |      0 |      30 |          0 |                 30 |
| Open cached projects |          0 |         0 |      0 |       0 |          0 |                  0 |
| Project queries      |          0 |         0 |     30 |       0 |          0 |                  0 |
| Enter tmux agent     |          0 |         1 |      0 |       0 |          2 |                  0 |

The first frame requests a snapshot plus pane read. Routine wide-screen navigation requests one
pane read per selection change. Agent entry requests statistics through both the keyboard action
and the polling hook. These are baseline observations for later preview/statistics work, not
desired final budgets. Update deterministic expectations with the relevant behavior change and
compare against this recorded baseline; do not turn these timings into CI pass/fail thresholds.

DEV-310 retired OpenCode statistics. The report and deterministic test now record this phase as
`agentEntry`, without a statistics counter: one inventory request and no other work. No
statistics callback, poll, private storage read, or model/export subprocess remains to count.

## OpenTUI 0.5.17 comparison

DEV-309 pinned OpenTUI core/react **0.5.17**. To separate the upgrade from the Bun change since the
recording above, both versions ran twice on **2026-10-17**, back to back: same host, Bun
`1.4.3`, mux-sesh `1.10.0`, FFF `0.10.1`. The 0.4.5 runs used a temporary worktree at
`39bb201`.

| Measurement (ms)               |   0.4.5 run 1 |   0.4.5 run 2 |  0.5.17 run 1 |  0.5.17 run 2 |
| ------------------------------ | ------------: | ------------: | ------------: | ------------: |
| Harness import                 |          56.4 |          56.2 |          59.8 |          58.9 |
| First usable frame             |          55.2 |          54.3 |          50.5 |          51.7 |
| Cached projects frame          |          31.7 |          30.0 |          27.8 |          29.1 |
| Navigation to frame p50 / p95  | 2.737 / 3.194 | 2.605 / 3.509 | 2.392 / 3.121 | 2.433 / 2.762 |
| Local project filter p50 / p95 | 0.753 / 1.201 | 0.708 / 0.855 | 0.697 / 1.903 | 0.765 / 1.896 |
| Project query to frame p50/p95 | 1.981 / 3.441 | 1.730 / 2.795 | 1.678 / 3.139 | 1.913 / 3.002 |

Work counts were identical in all four runs, and every run released its renderer and finder
resources. Local filtering does not render, so its p95 difference is not attributed to OpenTUI.
These are single-host fixture observations, not budgets.

## On-demand details (DEV-330)

The details panel (120+ columns) shows compact inventory context by default: title, path,
status, unit count, agent status, or project kind and linked session. It reads no backend, git,
file, or preview command. **Inspection is requested** only with the `toggle-details` action
("Toggle details" in the palette; `v` in vim, `<prefix> v` in standard). While the inspector is
open and the panel is on screen, the inspector owner (`src/app/inspector.ts`) reads details for
the selection:

- One read at a time: a newer selection, closing the inspector, a narrow terminal, or unmount
  aborts the older read through its signal, and only the current read may publish.
- Session reads pass the signal to `MultiplexerBackend.details`; project and file previews run git
  and configured preview commands through an owned runner with a 1.5 s deadline and a 256 KiB
  output limit (`PREVIEW_COMMAND_POLICY`).
- Nothing is cached by TTL. A changed config object (startup or preview rules), a backend change,
  or a settled startup/refresh inventory load (manual refresh, mutations, view changes; not
  Agents polls) re-reads the inspected target.
- A failed read stays in the panel. A failed re-read of the same target keeps the earlier content,
  labeled stale with the failure.

Back-to-back runs on **2026-11-26**, same host, `ac408c0` against this change:

| Measurement                   |        Before |         After |
| ----------------------------- | ------------: | ------------: |
| First usable frame (ms)       |          61.1 |          61.1 |
| Navigation to frame p50 / p95 | 2.486 / 3.025 | 1.786 / 2.240 |
| First frame preview / CLI     |         1 / 2 |         0 / 1 |
| Navigation preview / CLI      |       30 / 30 |         0 / 0 |

## Rework comparison (DEV-347)

Recorded **2026-11-26**, back to back on one host: the DEV-307 harness at `1cbd69b` (before),
in a temporary detached worktree, against the rework at `ce79b75` (after). Five runs per side,
alternating before/after, with no other builds or tests running. Both sides used the same fixture:
120×36, 200 sessions, 5,000 cached projects, 5 warmups and 30 samples per series, and an OS-warm
native corpus.

- Linux x64, kernel `7.2.15-1-omarchy`, AMD Ryzen 7 5800X3D; Bun `1.4.5`; mux-sesh `1.10.0`.
- React `19.2.8` and FFF Bun `0.10.1` on both sides. Before: OpenTUI `0.4.5`. After: OpenTUI
  `0.5.17` and Effect `4.0.5`.

To reproduce, check out both commits on one host, install with `bun install --frozen-lockfile` in
each, and alternate `bun tests/perf/run-baseline.ts > <side>-<n>.json` between them. Each cell is
the median of the five run-level values, with the range in parentheses. A run's p50/p95 is the
nearest rank over its 30 samples.

| Measurement (ms)            | Before `1cbd69b`    | After `ce79b75`     |
| --------------------------- | ------------------- | ------------------- |
| Harness import              | 54.0 (53.7–54.4)    | 128.5 (126.1–129.4) |
| First usable frame          | 49.8 (48.9–50.1)    | 63.2 (61.9–67.6)    |
| Cached projects frame       | 25.8 (24.8–26.9)    | 29.2 (28.2–29.8)    |
| Navigation to frame p50     | 2.546 (2.533–2.649) | 1.930 (1.816–2.053) |
| Navigation to frame p95     | 3.041 (2.910–3.709) | 2.472 (2.238–3.073) |
| Navigation preview p50/p95  | 0.214 / 0.317       | none (no reads)     |
| Local project filtering p50 | 0.680 (0.670–0.727) | 0.662 (0.651–0.665) |
| Local project filtering p95 | 1.428 (0.787–1.783) | 0.787 (0.752–1.651) |
| Project query to frame p50  | 1.681 (1.665–1.887) | 2.536 (2.501–2.721) |
| Project query to frame p95  | 2.879 (2.759–2.985) | 4.143 (4.009–4.647) |

Native FFF search is measured separately from the UI timings above, and nothing in it changed:

| Native FFF, 5,000 files (ms) | Before              | After               |
| ---------------------------- | ------------------- | ------------------- |
| `mixedSearch` p50            | 2.201 (2.155–2.227) | 2.202 (2.136–2.218) |
| `mixedSearch` p95            | 2.556 (2.495–2.674) | 2.505 (2.460–2.589) |
| Initialization and scan wait | 50.8 (50.8–50.9)    | 50.9 (50.8–53.2)    |

Work counts were the same in all five runs on each side:

| Phase                           | Before: inventory / preview / CLI | After: inventory / preview / CLI |
| ------------------------------- | --------------------------------: | -------------------------------: |
| First frame                     |                         1 / 1 / 2 |                        1 / 0 / 1 |
| 30 navigations                  |                       0 / 30 / 30 |                        0 / 0 / 0 |
| Open New                        |                         0 / 0 / 0 |                        0 / 0 / 0 |
| 30 project queries (30 filters) |                         0 / 0 / 0 |                        0 / 0 / 0 |
| Agent entry                     |   1 inventory, 2 statistics calls |        1 inventory, nothing else |

The old harness cannot count theme resolutions or filesystem calls, so there is no "before"
number for them. For the rework, `tests/work-budgets.test.tsx` asserts zero for both.

### Findings

- **Navigation is 0.6 ms faster at p50.** This matches the removal of the pane read on every
  selection change (DEV-330): 30 previews and 30 CLI calls dropped to zero.
- **Import is 74.5 ms slower.** Almost all of it is the cost of loading Effect; the OpenTUI
  upgrade added about 3 ms in the DEV-309 runs above. On this host,
  `await import('effect')` alone takes 71 ms (70.6–76.0 ms over three runs with a warm cache).
  Importing just the 13 Effect subpath modules that `src` uses takes 45 ms (44.6–46.7 ms). Moving
  to subpath imports could therefore save at most about 26 ms. That change was not applied: it
  touches 13 modules, including config, and needs approval as a broad change.
- **The first frame is 13.4 ms slower.** About 8 ms of that is Herdr snapshot decoding, which
  now validates through Effect Schema. For the 200-workspace fixture, the first `list()` takes
  10.0–10.7 ms, against 2.0–2.5 ms before. Warm calls take about 2.1 ms, against 0.7 ms before.
  Warm `JSON.parse` takes 0.2 ms and warm `parseHerdrSnapshot` takes 1.3–2.5 ms. The rest of the
  difference, about 5 ms, is not attributed.
- **Query to frame is 0.86 ms slower at p50 and 1.26 ms slower at p95.** Filtering is not the
  cause: it costs the same, it runs once per query on both sides, and the New tree went from 20
  to 18 renderables. A CPU profile of 400 queries puts about 0.7 ms per query in filtering and
  0.27 ms in textarea text reads. One of those reads is new: it comes from the layout effect that
  reconciles the textarea, about 0.1 ms. The remaining time is spread across React updates in
  the launcher and New-step hooks, with no single hotspot. The p95 of 4.1 ms is about a quarter
  of one 60 Hz frame (16.7 ms).
- **No profile-guided correction was made.** None of the measured costs points to a small, local
  fix with a meaningful gain. No direct-socket client, worker, daemon, or React rewrite was added.

### Work budgets asserted by `bun test`

These checks count work and never time it, so they cannot fail because of wall-clock variance.
Test files are under `tests/`.

- **No statistics calls and no filesystem stats.** `picker-baseline`: agent entry costs one
  inventory request and nothing else. `work-budgets`: after startup, navigation and project
  queries make no `fs` or `Bun.file` call and resolve no theme. The same spies see the
  system theme's palette read at startup, so a zero count is meaningful.
- **Navigation reads no backend, preview, or theme.** `picker-baseline`: navigation makes no
  preview reads and no CLI calls. `details-inspector-screen`: navigation at 120 columns reads no
  details. `app-screen`: arrow navigation never queries the backend inventory.
  `theme-palette-screen`: selection and query changes do not re-resolve the system theme.
- **Inventory loads are single-flight.** `picker-baseline`: startup makes one inventory request
  and one CLI call. `session-inventory`: three overlapping refresh requests cause at most two
  `list()` calls, and an Agents poll joins the load already in flight.
  `project-discovery-refresh`: overlapping requests for one revision share a single run.
- **Only the latest query or selection publishes.** `launcher-query`: a slower native result for
  an older query never replaces newer rows, and a stale native search is discarded.
  `details-inspector`: only the latest selection publishes. `session-inventory`: a late refresh
  cannot overwrite the newer inventory.
- **Rows stay within the viewport.** `work-budgets`: 200 sessions build the same renderable tree
  as 60, and 5,000 project candidates build the same tree as 300. `session-viewport-budget`: the
  viewport never exceeds its rows. `searchable-dialogs`: dialog viewports are bounded.
- **Command output is bounded.** `command-lifetime`: stdout past its limit stops the owned
  process, and stderr is retained within its bound. `project-preview`: a preview past its
  deadline falls back to the directory listing. `project-discovery-refresh`: a `find`
  output-limit hit is classified.
- **Discovery and native roots are bounded.** `launcher-query`: opening New on projects opens no
  native finder. `fff-search`: every root search keeps the native page limit, and a root dropped
  from the configured roots is released. `project-discovery`: dependency and build output
  directories are not scanned.
- **Owned resources are released.** `work-budgets`: unmounting closes the theme watcher and its
  signal listener, clears the Herdr poll interval, and interrupts runtime work; disposing the
  inventory interrupts its load, which never publishes. `fff-search` and `launcher-query`: each
  owned finder is destroyed exactly once. `command-lifetime`: disposing the application runtime
  stops in-flight owned commands. `details-inspector-screen`: unmounting releases a pending read.
