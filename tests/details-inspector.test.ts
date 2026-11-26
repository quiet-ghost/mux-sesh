import { afterAll, describe, expect, test } from 'bun:test'
import { createEffectRuntime } from '../src/app/effect-runtime'
import {
  createDetailsInspector,
  type DetailsContent,
  type DetailsRequest,
  type DetailsView,
} from '../src/app/inspector'
import { getDefaultConfig } from '../src/config'
import type { Config, Item } from '../src/types'

const effects = createEffectRuntime()

afterAll(() => effects.dispose())

function project(title: string): Item {
  return { title, desc: '', path: `/fixture/${title}`, isSession: false, itemKind: 'project' }
}

function config(previewCommand: string): Config {
  return { ...getDefaultConfig('/fixture'), projectPaths: [], defaultSession: { previewCommand } }
}

function content(label: string): DetailsContent {
  return {
    kind: 'project',
    preview: {
      path: '/fixture',
      sessionName: label,
      source: 'default',
      previewKind: 'directory',
      previewLabel: 'Directory Listing',
      previewLines: [label],
    },
  }
}

interface PendingLoad {
  readonly request: DetailsRequest
  readonly signal: AbortSignal
  resolve(value: DetailsContent): void
}

function harness() {
  const loads: PendingLoad[] = []
  const views: DetailsView[] = []
  const defects: unknown[] = []

  const inspector = createDetailsInspector({
    effects,
    load(request, signal) {
      const { promise, resolve } = Promise.withResolvers<DetailsContent>()
      loads.push({ request, signal, resolve })

      return promise
    },
    publish: view => views.push(view),
    onDefect: cause => defects.push(cause),
  })

  return { inspector, loads, views, defects }
}

async function flush(): Promise<void> {
  for (let tick = 0; tick < 10; tick++) await Bun.sleep(0)
}

describe('details inspector owner', () => {
  test('reloads when the config revision or inventory revision changes, not on repeats', async () => {
    const { inspector, loads } = harness()
    const item = project('alpha')

    const first: DetailsRequest = {
      key: 'alpha',
      item,
      config: config('ls'),
      backend: null,
      revision: 1,
    }

    inspector.show(first)
    inspector.show({ ...first })
    expect(loads).toHaveLength(1)

    const changed = config('eza')
    inspector.show({ ...first, config: changed })
    expect(loads).toHaveLength(2)

    inspector.show({ ...first, config: changed, revision: 2 })
    expect(loads).toHaveLength(3)
    expect(loads.slice(0, 2).every(load => load.signal.aborted)).toBe(true)
    inspector.dispose()
  })

  test('publishes only the latest selection and keeps same-target data as stale context', async () => {
    const { inspector, loads, views } = harness()
    const settings = config('ls')

    inspector.show({
      key: 'alpha',
      item: project('alpha'),
      config: settings,
      backend: null,
      revision: 1,
    })
    inspector.show({
      key: 'beta',
      item: project('beta'),
      config: settings,
      backend: null,
      revision: 1,
    })

    loads[1]?.resolve(content('beta'))
    await flush()
    loads[0]?.resolve(content('alpha'))
    await flush()

    expect(views.at(-1)).toEqual({ kind: 'ready', key: 'beta', content: content('beta') })
    inspector.dispose()
  })

  test('close aborts the read and publishes nothing late', async () => {
    const { inspector, loads, views } = harness()

    inspector.show({
      key: 'alpha',
      item: project('alpha'),
      config: config('ls'),
      backend: null,
      revision: 1,
    })
    inspector.close()
    expect(loads[0]?.signal.aborted).toBe(true)

    loads[0]?.resolve(content('alpha'))
    await flush()
    expect(views.at(-1)).toEqual({ kind: 'closed' })
    inspector.dispose()
  })
})
