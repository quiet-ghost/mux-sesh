const PERF_ENABLED = process.env.MUX_SESH_DEBUG_PERF === '1'

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
