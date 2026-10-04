const PERF_ENABLED = process.env.MUX_SESH_DEBUG_PERF === '1'

export interface TimingSummary {
  samples: number
  p50Ms: number | null
  p95Ms: number | null
}

export function summarizeTimings(samples: readonly number[]): TimingSummary {
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    samples: sorted.length,
    p50Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.5) - 1] : null,
    p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
  }
}

export async function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!PERF_ENABLED) {
    return fn()
  }

  const start = performance.now()
  try {
    return await fn()
  } finally {
    const duration = performance.now() - start
    console.error(`[perf] ${label}: ${duration.toFixed(1)}ms`)
  }
}

export function mark(label: string): void {
  if (!PERF_ENABLED) {
    return
  }

  console.error(`[perf] ${label}`)
}
