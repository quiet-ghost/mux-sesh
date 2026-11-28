export interface TeardownStep {
  readonly name: string
  readonly run: () => void
}

// Runs every step in order even when an earlier one throws. Only step names are kept, so the
// thrown values (which may hold paths or secrets) never reach the terminal.
export function runTeardownSteps(steps: readonly TeardownStep[]): readonly string[] {
  const failed: string[] = []

  for (const step of steps) {
    try {
      step.run()
    } catch {
      failed.push(step.name)
    }
  }

  return failed
}
