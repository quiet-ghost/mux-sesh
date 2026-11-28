import { expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import { act, useRef, useState } from 'react'
import { loadSessionItems } from '../src/app/inventory-load'
import { createEffectRuntime, type AppEffectRuntime } from '../src/app/effect-runtime'
import { useHerdrAgentPolling } from '../src/app/herdr-refresh'
import { useSessionInventory } from '../src/app/session-inventory'
import { getDefaultConfig } from '../src/config'
import { createHerdrBackend } from '../src/herdr/backend'
import { CommandTransportError } from '../src/multiplexer/command'
import type { MultiplexerBackend } from '../src/multiplexer/types'
import { AppMode, ViewMode, type Item } from '../src/types'

const config = getDefaultConfig('/fixture')

interface Props {
  effects: AppEffectRuntime
  backend: MultiplexerBackend
  initialItems: Item[]
}

function RefreshScreen({ effects, backend, initialItems }: Props) {
  const [sessionItems, setSessionItems] = useState(initialItems)
  const [allItems, setAllItems] = useState(initialItems)
  const [items, setItems] = useState(initialItems)
  const [, setProjectSourceItems] = useState<Item[]>([])
  const [, setLiveSessions] = useState<Item[]>([])
  const [viewMode, setViewMode] = useState(ViewMode.Sessions)
  const [sessionCursor, setSessionCursor] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [message, setMessage] = useState('')
  const lastSessionSelectionRef = useRef<string | null>(null)
  const lastProjectSelectionRef = useRef<string | null>(null)

  const inventory = useSessionInventory(effects, async (_name, run) => run(), {
    viewMode,
    config,
    backend,
    cursor: sessionCursor,
    agentCursor: cursor,
    selectedAgentSession: items[cursor],
    lastSessionSelectionRef,
    lastProjectSelectionRef,
    setViewMode,
    setSessionItems,
    setLiveSessions,
    setProjectSourceItems,
    setAllItems,
    setItems,
    setCursor: setSessionCursor,
    setAgentCursor: setCursor,
    setMessage,
  })

  useHerdrAgentPolling(inventory, AppMode.AgentsManage, viewMode, config, backend)

  return (
    <box flexDirection="column">
      <text>{`sessions: ${sessionItems.map(item => item.title).join(',')}`}</text>
      <text>{`all: ${allItems.map(item => item.title).join(',')}`}</text>
      <text>{`selected: ${items[cursor]?.title}`}</text>
      <text>{message}</text>
    </box>
  )
}

test('an expected Herdr polling failure leaves rendered inventory and selection usable', async () => {
  let fail = false
  let calls = 0

  const effects = createEffectRuntime({
    async run() {
      calls++

      if (fail)
        throw new CommandTransportError({
          executable: 'herdr',
          phase: 'read',
          cause: new Error('fixture read failure'),
        })

      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          result: {
            type: 'session_snapshot',
            snapshot: {
              workspaces: [
                {
                  workspace_id: 'w1',
                  label: 'existing',
                  focused: false,
                  tab_count: 1,
                  active_tab_id: 'w1:t1',
                  agent_status: 'working',
                },
              ],
              tabs: [],
              panes: [],
              layouts: [],
              agents: [],
            },
          },
        }),
      }
    },
  })

  const backend = createHerdrBackend({ runner: effects.runner, insideHerdr: true })

  try {
    const { sessionItems } = await loadSessionItems(config, async (_name, run) => run(), backend)
    fail = true

    const screen = await testRender(
      <RefreshScreen effects={effects} backend={backend} initialItems={sessionItems} />,
      {
        width: 120,
        height: 18,
        consoleMode: 'disabled',
      }
    )

    try {
      await act(async () => {})
      await screen.renderOnce()
      const frame = screen.captureCharFrame()
      expect(frame).toContain('sessions: existing')
      expect(frame).toContain('all: existing')
      expect(frame).toContain('selected: existing')
      expect(frame).toMatch(/Existing\s+sessions are unchanged/)
      expect(calls).toBe(2)
    } finally {
      act(() => screen.renderer.destroy())
    }
  } finally {
    await effects.dispose()
  }
})
