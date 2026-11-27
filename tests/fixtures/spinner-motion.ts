import { act } from 'react'
import { SPINNER_FRAMES, type SpinnerMotion } from '../../src/ui/Spinner'

export interface FakeSpinnerMotion {
  readonly motion: SpinnerMotion
  // Intervals started and not yet stopped.
  active(): number
  starts(): number
  intervals(): number[]
  // Each read is one animated spinner render.
  frameReads(): number
  tick(): void
}

// Spinner timers run only when the test ticks them; nothing waits on the wall clock.
export function createFakeSpinnerMotion(): FakeSpinnerMotion {
  const ticks = new Set<() => void>()
  const intervals: number[] = []
  let frameReads = 0

  const motion: SpinnerMotion = {
    kind: 'animated',
    every(tick, intervalMs) {
      const owned = () => tick()
      intervals.push(intervalMs)
      ticks.add(owned)

      return () => {
        ticks.delete(owned)
      }
    },
    frame(index) {
      frameReads++

      return SPINNER_FRAMES[index % SPINNER_FRAMES.length] ?? ''
    },
  }

  return {
    motion,
    active: () => ticks.size,
    starts: () => intervals.length,
    intervals: () => [...intervals],
    frameReads: () => frameReads,
    tick() {
      act(() => {
        for (const tick of ticks) tick()
      })
    },
  }
}
