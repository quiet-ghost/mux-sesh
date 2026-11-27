import { expect, test } from 'bun:test'
import type { OperationReport } from '../src/app/action-outcome'
import { handleNewSessionSubmitWithPreview, type LaunchGuard } from '../src/app/handlers'
import {
  MultiplexerError,
  type CreatedSessionReceipt,
  type MultiplexerBackend,
} from '../src/multiplexer/types'
import type { LaunchPreview } from '../src/sessions/launch-plan'
import type { ToastInput } from '../src/app/notifications'
import { NO_GIT } from './fixtures/local-github'

const receipt: CreatedSessionReceipt = {
  workspace: { backend: 'herdr', id: 'w9', title: 'scratch' },
  rootPaneId: 'w9:p1',
}

function unsupported(): never {
  throw new Error('The submit test backend only creates')
}

const scratch: LaunchPreview = {
  kind: 'ready',
  subject: 'selected',
  plan: { kind: 'create', input: { title: 'scratch', path: '/fixture/scratch' } },
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
    clone: NO_GIT,
    backend,
    launchGuard,
    showToast: (toast: ToastInput) => {
      messages.push(`${toast.kind}: ${toast.message}`)
    },
    showOutcome: (report: OperationReport) => {
      reports.push(report)
    },
    refreshItems: async () => {
      refreshes++
    },
  }

  const first = handleNewSessionSubmitWithPreview(scratch, options)
  await handleNewSessionSubmitWithPreview(scratch, options)

  expect(messages).toEqual(['warning: A launch is already running; wait for it to finish.'])

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

function recording() {
  const calls: string[] = []
  const messages: string[] = []

  const backend: MultiplexerBackend = {
    kind: 'herdr',
    capabilities: { previousWorkspace: false },
    async create(input) {
      calls.push(`create ${input.title}`)

      return receipt
    },
    async start() {},
    async open(target) {
      calls.push(`open ${target.id}`)

      throw new MultiplexerError('command-failed', 'fixture client unavailable')
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

  const options = {
    clone: NO_GIT,
    backend,
    launchGuard: { active: false },
    showToast: (toast: ToastInput) => {
      messages.push(`${toast.kind}: ${toast.message}`)
    },
    showOutcome: () => {},
    refreshItems: async () => {},
  }

  return { calls, messages, options }
}

test('Enter executes the shown plan as frozen: a focus plan only opens its exact target', async () => {
  const { calls, messages, options } = recording()

  await handleNewSessionSubmitWithPreview(
    {
      kind: 'ready',
      subject: 'selected',
      plan: {
        kind: 'focus',
        target: { backend: 'herdr', id: 'w4', title: 'api' },
        path: '/fixture/api',
      },
    },
    options
  )

  expect(calls).toEqual(['open w4'])
  expect(messages[0]).toStartWith('error: ')
  expect(messages[0]).toBe(
    "error: Could not open workspace 'api': fixture client unavailable. Nothing was created."
  )
})

test.each<{ preview: LaunchPreview; message: string }>([
  { preview: { kind: 'no-candidates' }, message: 'Nothing to open: no projects' },
  { preview: { kind: 'no-match', query: 'scratch' }, message: "no project matches 'scratch'" },
])('$preview.kind creates nothing and warns why', async ({ preview, message }) => {
  const { calls, messages, options } = recording()

  await handleNewSessionSubmitWithPreview(preview, options)

  expect(calls).toEqual([])
  expect(messages).toHaveLength(1)
  expect(messages[0]).toStartWith('warning: ')
  expect(messages[0]).toContain(message)
})
