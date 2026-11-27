import { afterEach, describe, expect, test } from 'bun:test'
import { testRender } from '@opentui/react/test-utils'
import type { DetailsView } from '../src/app/inspector'
import type { LaunchPreview } from '../src/sessions/launch-plan'
import type { Item } from '../src/types'
import NewSessionSummary from '../src/ui/NewSessionSummary'
import SessionDetailsPanel from '../src/ui/SessionDetailsPanel'

const HOME = process.env.HOME ?? ''
const LONG_PATH = `${HOME}/dev/worktrees/projects/an-extremely-long-parent/mux-sesh`

let setup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
})

async function frame(node: React.ReactNode, width: number, height: number): Promise<string[]> {
  setup = await testRender(node, { width, height, consoleMode: 'disabled' })
  await setup.renderOnce()

  return setup.captureCharFrame().split('\n')
}

const project: Item = {
  title: 'mux-sesh',
  desc: '',
  path: LONG_PATH,
  isSession: false,
  itemKind: 'project',
}

const closed: DetailsView = { kind: 'closed' }

describe('long paths keep their start and end', () => {
  test('in the compact details panel', async () => {
    const lines = await frame(
      <SessionDetailsPanel
        width={30}
        selectedItem={project}
        mode="compact"
        view={closed}
        inspectHint="v"
      />,
      30,
      10
    )

    const path = lines.find(line => line.includes('~/dev'))
    expect(path?.trim()).toBe('~/dev/worktree…rent/mux-sesh')
  })

  test('in the New summary, keeping the action words', async () => {
    const preview: LaunchPreview = {
      kind: 'ready',
      subject: 'selected',
      plan: { kind: 'create', input: { title: 'api', path: LONG_PATH, startupCommand: 'bun dev' } },
    }

    const lines = await frame(<NewSessionSummary preview={preview} width={60} />, 60, 3)

    expect(lines[0]?.trimEnd()).toBe("Create 'api' in ~/dev/worktr…ent/mux-sesh, then run: bun dev")
  })

  test('in the New summary note that names a directory', async () => {
    const preview: LaunchPreview = { kind: 'name-required', directory: LONG_PATH }
    const lines = await frame(<NewSessionSummary preview={preview} width={50} />, 50, 3)

    expect(lines[0]?.trimEnd()).toBe('Type a name; Enter creates it in ~/dev/wo…ux-sesh.')
  })
})
