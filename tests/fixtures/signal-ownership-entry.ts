// Usage: bun tests/fixtures/signal-ownership-entry.ts. Runs the real entry point, then prints a
// marker once its top-level code (signal handlers included) has finished.
export const SIGNAL_HANDLERS_READY = 'mux-sesh-test:signal-handlers-ready'

if (import.meta.main) {
  await import('../../src/index')
  process.stdout.write(`\n${SIGNAL_HANDLERS_READY}\n`)
}
