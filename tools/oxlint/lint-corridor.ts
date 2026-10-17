// Files that must already pass every lint rule. Add each module or test as a slice refines it;
// `bun run lint` reports the remaining legacy findings across the repository.
export const LINT_CORRIDOR = [
  'src/app.tsx',
  'src/app/derived.ts',
  'src/app/runtime.ts',
  'src/cli/invocation-cwd.ts',
  'src/files/target.ts',
  'src/handlers/keyboard/agents.ts',
  'src/index.tsx',
  'src/ui/ErrorScreen.tsx',
  'src/util/diagnostic-text.ts',
  'src/util/errors.ts',
  'src/util/perf.ts',
  'src/util/shutdown.ts',
  'tests/agents-navigation.test.tsx',
  'tests/app-screen.test.tsx',
  'tests/cli-wrapper.test.ts',
  'tests/error-screen.test.tsx',
  'tests/errors.test.ts',
  'tests/file-target.test.ts',
  'tests/fixtures/cli-wrapper-probe.tsx',
  'tests/fixtures/session-screen-exit.ts',
  'tests/fixtures/session-screen.tsx',
  'tests/fixtures/shutdown-react.tsx',
  'tests/perf',
  'tests/perf.test.ts',
  'tests/picker-baseline.test.ts',
  'tests/shutdown.test.ts',
  'tools/oxlint/lint-corridor.ts',
] as const

const lint = Bun.spawn(
  [
    process.execPath,
    'run',
    '--bun',
    'oxlint',
    '--deny-warnings',
    ...LINT_CORRIDOR,
    ...process.argv.slice(2),
  ],
  {
    stdout: 'inherit',
    stderr: 'inherit',
  }
)

process.exit(await lint.exited)
