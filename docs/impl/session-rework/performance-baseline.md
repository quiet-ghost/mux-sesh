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
- A separate **60×18** one-agent tmux fixture counts statistics requests when entering Agents.
  The count-only callback returns `null`; private storage and model/export calls are not accessed.
  The probe closes immediately after the entry frame, before intentional interval polling.
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
