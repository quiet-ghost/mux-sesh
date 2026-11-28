import { afterEach, describe, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { act, useState, type ReactNode } from 'react'
import type { DetailsView } from '../src/app/inspector'
import type { LaunchPreview, PreparedLaunch } from '../src/sessions/launch-plan'
import type { Item } from '../src/items/item'
import NewSessionSummary from '../src/ui/NewSessionSummary'
import SessionDetailsPanel from '../src/ui/SessionDetailsPanel'
import {
  BusyContext,
  BusySpinner,
  getSpinnerMotion,
  Spinner,
  SPINNER_INTERVAL_MS,
  SpinnerMotionContext,
  STILL_MOTION,
} from '../src/ui/Spinner'
import { createPendingFlag, type PendingSignal } from '../src/util/pending'
import { createFakeSpinnerMotion, type FakeSpinnerMotion } from './fixtures/spinner-motion'

let setup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  if (setup && !setup.renderer.isDestroyed) act(() => setup?.renderer.destroy())
  setup = undefined
})

async function mount(node: ReactNode, width = 40, height = 4) {
  await act(async () => {
    setup = await testRender(node, { width, height, consoleMode: 'disabled' })
  })

  if (!setup) throw new Error('The spinner test renderer was not created')
  const mounted = setup

  return {
    async lines(): Promise<string[]> {
      await mounted.renderOnce()

      return mounted.captureCharFrame().split('\n')
    },
    destroy(): void {
      act(() => mounted.renderer.destroy())
    },
  }
}

// A parent whose own state changes stand in for navigation; the children never change.
function navigable(children: ReactNode) {
  const control = { navigate: () => {}, renders: 0 }

  function Navigable() {
    const [cursor, setCursor] = useState(0)
    control.navigate = () => setCursor(value => value + 1)
    control.renders++

    return (
      <box style={{ flexDirection: 'column' }}>
        <text>{`row ${cursor}`}</text>
        {children}
      </box>
    )
  }

  return { control, Navigable }
}

describe('spinner motion', () => {
  test('animates on a terminal unless MUX_SESH_NO_ANIMATION=1', () => {
    expect(getSpinnerMotion({}, true).kind).toBe('animated')
    expect(getSpinnerMotion({ MUX_SESH_NO_ANIMATION: '1' }, true).kind).toBe('still')
    expect(getSpinnerMotion({}, false).kind).toBe('still')
  })
})

describe('Spinner', () => {
  test('owns one interval while mounted and advances one frame per tick', async () => {
    const fake = createFakeSpinnerMotion()

    const screen = await mount(
      <SpinnerMotionContext value={fake.motion}>
        <text>
          <Spinner />
          <span>Loading…</span>
        </text>
      </SpinnerMotionContext>
    )

    expect((await screen.lines())[0]?.trimEnd()).toBe('⠋ Loading…')
    expect(fake.active()).toBe(1)
    expect(fake.intervals()).toEqual([SPINNER_INTERVAL_MS])

    fake.tick()
    fake.tick()
    expect((await screen.lines())[0]?.trimEnd()).toBe('⠹ Loading…')

    screen.destroy()
    expect(fake.active()).toBe(0)
  })

  test('without animation shows a still mark, or nothing, and starts no timer', async () => {
    const screen = await mount(
      <SpinnerMotionContext value={STILL_MOTION}>
        <text>
          <Spinner />
          <span>busy</span>
        </text>
        <text>
          <Spinner still="" />
          <span>Loading…</span>
        </text>
      </SpinnerMotionContext>
    )

    const lines = await screen.lines()
    expect(lines[0]?.trimEnd()).toBe('… busy')
    expect(lines[1]?.trimEnd()).toBe('Loading…')
  })
})

function countedSignal(signal: PendingSignal) {
  const counted = { reads: 0 }

  const read: PendingSignal = {
    pending() {
      counted.reads++

      return signal.pending()
    },
    subscribe: listener => signal.subscribe(listener),
  }

  return { counted, read }
}

describe('BusySpinner', () => {
  test('runs a timer only while busy, and navigation never renders it', async () => {
    const fake = createFakeSpinnerMotion()
    const flag = createPendingFlag()
    const { counted, read } = countedSignal(flag)

    const { control, Navigable } = navigable(
      <text>
        <BusySpinner />
        <span>3 sessions</span>
      </text>
    )

    const screen = await mount(
      <SpinnerMotionContext value={fake.motion}>
        <BusyContext value={read}>
          <Navigable />
        </BusyContext>
      </SpinnerMotionContext>
    )

    expect((await screen.lines())[1]?.trimEnd()).toBe('3 sessions')
    const readsAtMount = counted.reads

    for (let step = 0; step < 5; step++) {
      act(() => control.navigate())
      await screen.lines()
    }

    expect(control.renders).toBe(6)
    expect(counted.reads).toBe(readsAtMount)
    expect(fake.starts()).toBe(0)
    expect(fake.frameReads()).toBe(0)

    act(() => {
      flag.active = true
    })
    expect((await screen.lines())[1]?.trimEnd()).toBe('⠋ 3 sessions')
    expect(fake.active()).toBe(1)

    fake.tick()
    const framesWhileBusy = fake.frameReads()
    act(() => control.navigate())
    expect((await screen.lines())[1]?.trimEnd()).toBe('⠙ 3 sessions')
    expect(fake.frameReads()).toBe(framesWhileBusy)

    act(() => {
      flag.active = false
    })
    expect((await screen.lines())[1]?.trimEnd()).toBe('3 sessions')
    expect(fake.active()).toBe(0)
    expect(fake.starts()).toBe(1)
  })

  test('is idle without a busy signal', async () => {
    const fake = createFakeSpinnerMotion()

    const screen = await mount(
      <SpinnerMotionContext value={fake.motion}>
        <text>
          <BusySpinner />
          <span>idle</span>
        </text>
      </SpinnerMotionContext>
    )

    expect((await screen.lines())[0]?.trimEnd()).toBe('idle')
    expect(fake.starts()).toBe(0)
  })
})

const project: Item = {
  title: 'api',
  desc: '',
  path: '/fixture/api',
  isSession: false,
  itemKind: 'project',
}

function switchable<T>(initial: T, render: (value: T) => ReactNode) {
  const control = { set: (_value: T) => {} }

  function Switch() {
    const [value, setValue] = useState(initial)
    control.set = setValue

    return render(value)
  }

  return { control, Switch }
}

async function expectSpinnerFollows<T>(
  fake: FakeSpinnerMotion,
  pending: T,
  settled: T,
  render: (value: T) => ReactNode,
  expected: { pending: string; settled: string }
): Promise<void> {
  const { control, Switch } = switchable(pending, render)

  const screen = await mount(
    <SpinnerMotionContext value={fake.motion}>
      <Switch />
    </SpinnerMotionContext>,
    40,
    8
  )

  expect((await screen.lines()).join('\n')).toContain(expected.pending)
  expect(fake.active()).toBe(1)

  act(() => control.set(settled))
  const lines = (await screen.lines()).join('\n')

  expect(lines).toContain(expected.settled)
  expect(lines).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
  expect(fake.active()).toBe(0)
}

describe('pending work shows a spinner until it settles', () => {
  test('the details inspector while it reads', async () => {
    const loading: DetailsView = { kind: 'loading', key: 'project:/fixture/api' }
    const failed: DetailsView = { kind: 'failed', key: 'project:/fixture/api', message: 'gone' }

    await expectSpinnerFollows<DetailsView>(
      createFakeSpinnerMotion(),
      loading,
      failed,
      view => (
        <SessionDetailsPanel
          width={40}
          selectedItem={project}
          mode="inspecting"
          view={view}
          inspectHint="v"
        />
      ),
      { pending: '⠋ Loading…', settled: 'gone' }
    )
  })

  test('the New summary while it plans', async () => {
    const planning: LaunchPreview = {
      kind: 'planning',
      prepared: new Promise<PreparedLaunch>(() => {}),
    }

    const ready: LaunchPreview = {
      kind: 'ready',
      subject: 'selected',
      plan: { kind: 'create', input: { title: 'api', path: '/fixture/api' } },
    }

    await expectSpinnerFollows<LaunchPreview>(
      createFakeSpinnerMotion(),
      planning,
      ready,
      preview => <NewSessionSummary preview={preview} width={40} />,
      { pending: '⠋ Checking what Enter will open…', settled: "Create 'api' in /fixture/api" }
    )
  })
})
