import { describe, expect, test } from 'bun:test'
import { summarizeTimings } from '../src/util/perf'

describe('performance summaries', () => {
  test('reports nearest-rank percentiles without changing sample order', () => {
    const samples = [20, 1, 19, 2, 18, 3, 17, 4, 16, 5, 15, 6, 14, 7, 13, 8, 12, 9, 11, 10]
    const original = [...samples]

    expect(summarizeTimings(samples)).toEqual({ samples: 20, p50Ms: 10, p95Ms: 19 })
    expect(samples).toEqual(original)
  })

  test('distinguishes no measurements from measured zero latency', () => {
    expect(summarizeTimings([])).toEqual({ samples: 0, p50Ms: null, p95Ms: null })
    expect(summarizeTimings([0])).toEqual({ samples: 1, p50Ms: 0, p95Ms: 0 })
  })
})
