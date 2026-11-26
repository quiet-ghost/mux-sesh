import { expect, test } from 'bun:test'
import type { OperationReport } from '../src/app/action-outcome'
import { handleNewSessionSubmitWithSearch, type LaunchGuard } from '../src/app/handlers'
import { getDefaultConfig } from '../src/config'
import type { CreatedSessionReceipt, MultiplexerBackend } from '../src/multiplexer/types'

const receipt: CreatedSessionReceipt = {
  workspace: { backend: 'herdr', id: 'w9', title: 'scratch' },
  rootPaneId: 'w9:p1',
}

function unsupported(): never {
  throw new Error('The submit test backend only creates')
}

test('a second Enter while a launch runs is refused, and a failed launch refreshes inventory', async () => {
  const creation = Promise.withResolvers<CreatedSessionReceipt>()
  const calls: string[] = []
  const messages: string[] = []
  const reports: OperationReport[] = []
  let refreshes = 0

  const backend: MultiplexerBackend = {
    kind: 'herdr',
    capabilities: { previousWorkspace: false },
    async create(input) {
      calls.push(`create ${input.title}`)

      return creation.promise
    },
    async start() {},
    async open() {
      calls.push('open')

      throw new Error('fixture client unavailable')
    },
    openOrCreate: unsupported,
    list: unsupported,
    rename: unsupported,
    close: unsupported,
    current: unsupported,
    directory: unsupported,
    details: unsupported,
    openEditor: unsupported,
  }

  const launchGuard: LaunchGuard = { active: false }

  const options = {
    invocationCwd: '/fixture',
    backend,
    config: getDefaultConfig('/fixture'),
    items: [],
    sessionItems: [],
    cursor: 0,
    launchGuard,
    showMessage: (message: string) => {
      messages.push(message)
    },
    showOutcome: (report: OperationReport) => {
      reports.push(report)
    },
    refreshItems: async () => {
      refreshes++
    },
  }

  const first = handleNewSessionSubmitWithSearch('scratch', options)
  await handleNewSessionSubmitWithSearch('scratch', options)

  expect(messages).toEqual(['A launch is already running; wait for it to finish.'])

  creation.resolve(receipt)
  await first

  expect(calls).toEqual(['create scratch', 'open'])
  expect(messages).toHaveLength(1)
  expect(reports).toHaveLength(1)
  expect(reports[0]).toMatchObject({ kind: 'partial', completed: ["Created workspace 'scratch'"] })
  expect(reports[0]?.kind === 'partial' && reports[0].failed).toContain(
    'fixture client unavailable'
  )
  expect(refreshes).toBe(1)
  expect(launchGuard.active).toBe(false)
})
