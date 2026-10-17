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
