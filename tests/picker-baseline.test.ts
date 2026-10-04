import { describe, expect, test } from 'bun:test'
import { runPickerBaseline } from './perf/picker-baseline'

describe('picker performance work counts', () => {
  test('counts inventory, navigation previews, project filtering, and statistics', async () => {
    const baseline = await runPickerBaseline({ iterations: 3, warmup: 0 })

    expect(baseline.corpus).toEqual({ sessions: 200, projects: 5000 })
    expect(baseline.work.startup).toEqual({
      navigation: 0,
      inventory: 1,
      search: 0,
      preview: 1,
      statistics: 0,
      subprocess: 2,
    })
    expect(baseline.work.navigation).toEqual({
      navigation: 3,
      inventory: 0,
      search: 0,
      preview: 3,
      statistics: 0,
      subprocess: 3,
    })
    expect(baseline.work.queries).toEqual({
      navigation: 0,
      inventory: 0,
      search: 3,
      preview: 0,
      statistics: 0,
      subprocess: 0,
    })
    expect(baseline.work.statistics).toEqual({
      navigation: 0,
      inventory: 1,
      search: 0,
      preview: 0,
      statistics: 2,
      subprocess: 0,
    })
    expect(baseline.timings.queryToFrame.samples).toBe(3)
    expect(baseline.timings.localFilter.samples).toBe(3)
    expect(baseline.released).toBe(true)
  })
})
