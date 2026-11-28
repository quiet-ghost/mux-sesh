export interface FrameSource {
  frame(): Promise<string>
  settle?(): Promise<void>
}

// Bounded by the wall clock, not by ticks, so a slower machine sees the same frame. Resolves to
// the first frame the predicate accepts, or undefined when the timeout passes first.
export async function waitForFrame(
  fixture: FrameSource,
  predicate: (frame: string) => boolean,
  timeoutMs: number
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await fixture.settle?.()
    const frame = await fixture.frame()

    if (predicate(frame)) return frame
    await Bun.sleep(5)
  }

  return undefined
}

// Yields to the event loop n times so queued promise callbacks and zero-delay timers run.
export async function settleTicks(n: number): Promise<void> {
  for (let tick = 0; tick < n; tick++) await Bun.sleep(0)
}
