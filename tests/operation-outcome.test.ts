import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { OperationReport } from '../src/app/action-outcome'
import {
  handleNewSessionSubmitWithSearch,
  handleOutcomeRetryWithFeedback,
  handleSettingOptionSubmitWithFeedback,
  handleSettingsEditorSubmitWithFeedback,
  handleTogglePinnedSessionWithFeedback,
  type LaunchGuard,
} from '../src/app/handlers'
import { getDefaultConfig } from '../src/config'
import { CommandTimeoutError } from '../src/multiplexer/command'
import {
  MultiplexerError,
  type CreatedSessionReceipt,
  type MultiplexerBackend,
} from '../src/multiplexer/types'
import type { Config } from '../src/types'

const receipt: CreatedSessionReceipt = {
  workspace: { backend: 'herdr', id: 'w9', title: 'scratch' },
  rootPaneId: 'w9:p1',
}

function unsupported(): never {
  throw new Error('The outcome test backend does not implement that operation')
}

interface BackendScript {
  create?: () => Promise<CreatedSessionReceipt>
  start?: () => Promise<void>
  open?: () => Promise<never>
}

function scriptedBackend(script: BackendScript) {
  const calls: string[] = []

  const backend: MultiplexerBackend = {
    kind: 'herdr',
    capabilities: { previousWorkspace: false },
    async create(input) {
      calls.push(`create ${input.title}`)

      return script.create ? script.create() : receipt
    },
    async start(created, command) {
      calls.push(`start ${created.rootPaneId} ${command}`)

      if (script.start) await script.start()
    },
    async open(target) {
      calls.push(`open ${target.id}`)

      if (script.open) return script.open()

      throw new MultiplexerError('command-failed', 'Herdr could not focus the workspace')
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

  return { backend, calls }
}

function launchOptions(backend: MultiplexerBackend, config: Config = getDefaultConfig('/fixture')) {
  const messages: string[] = []
  const reports: OperationReport[] = []
  const launchGuard: LaunchGuard = { active: false }
  let refreshes = 0

  return {
    messages,
    reports,
    refreshes: () => refreshes,
    options: {
      invocationCwd: '/fixture',
      backend,
      config,
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
      closeModal: () => {
        messages.push('closed')
      },
      refreshItems: async () => {
        refreshes++
      },
    },
  }
}

function onlyReport(reports: OperationReport[]): OperationReport {
  expect(reports).toHaveLength(1)
  const [report] = reports

  if (!report) throw new Error('Expected one operation report')

  return report
}

test('a created workspace that cannot be opened shows a partial outcome that retries only the open', async () => {
  const { backend, calls } = scriptedBackend({})
  const launch = launchOptions(backend)

  await handleNewSessionSubmitWithSearch('scratch', launch.options)

  const report = onlyReport(launch.reports)
  expect(report).toMatchObject({
    kind: 'partial',
    completed: ["Created workspace 'scratch'"],
    retry: { kind: 'open', target: receipt.workspace },
  })
  expect(report.kind === 'partial' && report.failed).toContain(
    'Herdr could not focus the workspace'
  )
  expect(launch.messages).toEqual([])
  expect(launch.refreshes()).toBe(1)

  await handleOutcomeRetryWithFeedback(report, launch.options)

  expect(calls).toEqual(['create scratch', 'open w9', 'open w9'])
  expect(launch.reports).toHaveLength(2)
  expect(launch.reports[1]).toMatchObject({ kind: 'partial', retry: { kind: 'open' } })
  expect(launch.options.launchGuard.active).toBe(false)
})

test('a failed startup command keeps the workspace and offers opening it, not re-running startup', async () => {
  const { backend, calls } = scriptedBackend({
    start: async () => {
      throw new MultiplexerError('command-failed', 'pane run refused')
    },
  })

  const config = { ...getDefaultConfig('/fixture'), defaultSession: { startupCommand: 'bun dev' } }
  const launch = launchOptions(backend, config)

  const project = {
    title: 'api',
    desc: '',
    path: '/fixture/api',
    isSession: false,
    itemKind: 'project' as const,
  }

  await handleNewSessionSubmitWithSearch('', { ...launch.options, items: [project] })

  const report = onlyReport(launch.reports)
  expect(report).toMatchObject({
    kind: 'partial',
    completed: ["Created workspace 'scratch'"],
    retry: { kind: 'open', target: receipt.workspace },
  })
  expect(report.kind === 'partial' && report.failed).toContain('pane run refused')
  expect(report.next).toContain('without re-running')

  await handleOutcomeRetryWithFeedback(report, launch.options)

  expect(calls).toEqual(['create api', 'start w9:p1 bun dev', 'open w9'])
})

test('a create that times out is an unknown outcome with no retry', async () => {
  const { backend, calls } = scriptedBackend({
    create: async () => {
      throw new CommandTimeoutError({ executable: 'herdr', timeoutMs: 5000 })
    },
  })

  const launch = launchOptions(backend)

  await handleNewSessionSubmitWithSearch('scratch', launch.options)

  const report = onlyReport(launch.reports)
  expect(report.kind).toBe('unknown')
  expect(report).not.toHaveProperty('retry')
  expect(report.next).toContain('may already exist')
  expect(calls).toEqual(['create scratch'])
  expect(launch.refreshes()).toBe(1)
})

test('a definite create failure stays a local message and creates nothing', async () => {
  const { backend } = scriptedBackend({
    create: async () => {
      throw new MultiplexerError('command-failed', 'label already used')
    },
  })

  const launch = launchOptions(backend)

  await handleNewSessionSubmitWithSearch('scratch', launch.options)

  expect(launch.reports).toEqual([])
  expect(launch.messages).toHaveLength(1)
  expect(launch.messages[0]).toContain("Could not create workspace 'scratch'")
  expect(launch.messages[0]).toContain('label already used')
})

let reposPath: string | undefined

afterEach(async () => {
  if (reposPath) await rm(reposPath, { recursive: true, force: true })
  reposPath = undefined
})

test('a reused clone whose workspace cannot be opened reports the repository and the created workspace', async () => {
  reposPath = await mkdtemp(join(tmpdir(), 'mux-sesh-outcome-'))
  const clonePath = join(reposPath, 'widget')
  await mkdir(clonePath)

  const { backend, calls } = scriptedBackend({})

  const launch = launchOptions(backend, {
    ...getDefaultConfig('/fixture'),
    reposPath,
    defaultSession: {},
  })

  await handleNewSessionSubmitWithSearch('https://github.com/acme/widget', launch.options)

  const report = onlyReport(launch.reports)
  expect(report).toMatchObject({
    kind: 'partial',
    completed: [`The repository is at ${clonePath}`, "Created workspace 'scratch'"],
    retry: { kind: 'open', target: receipt.workspace },
  })
  expect(calls).toEqual(['create widget', 'open w9'])
})

function settingsOptions(
  saveConfig: (config: Config) => Promise<void>,
  refreshItems: () => Promise<void>
) {
  const saved: Config[] = []
  const messages: string[] = []
  const reports: OperationReport[] = []
  const editorErrors: string[] = []
  const opened: string[] = []

  return {
    saved,
    messages,
    reports,
    editorErrors,
    opened,
    options: {
      config: { ...getDefaultConfig('/fixture'), pinnedSessions: [] },
      saveConfig,
      setConfig: (config: Config) => {
        saved.push(config)
      },
      setSettingEditorError: (message: string) => {
        editorErrors.push(message)
      },
      openSettingsModal: () => {
        opened.push('settings')
      },
      settingEditorValue: 'nvim',
      refreshItems,
      showMessage: (message: string) => {
        messages.push(message)
      },
      showOutcome: (report: OperationReport) => {
        reports.push(report)
      },
    },
  }
}

test('a saved pin whose refresh fails reports the saved pin and retries only the refresh', async () => {
  let refreshes = 0
  const writes: Config[] = []

  const settings = settingsOptions(
    async config => {
      writes.push(config)
    },
    async () => {
      refreshes++

      if (refreshes === 1) throw new MultiplexerError('server-stopped', 'Herdr server stopped')
    }
  )

  await handleTogglePinnedSessionWithFeedback('alpha', settings.options)

  expect(writes).toHaveLength(1)
  expect(settings.saved.map(config => config.pinnedSessions)).toEqual([['alpha']])

  const report = onlyReport(settings.reports)
  expect(report).toMatchObject({ kind: 'partial', retry: { kind: 'refresh' } })
  expect(report.completed.join(' ')).toContain("'alpha' pinned")
  expect(report.kind === 'partial' && report.failed).toContain('Herdr server stopped')

  const retry = launchOptions(scriptedBackend({}).backend)
  await handleOutcomeRetryWithFeedback(report, {
    ...retry.options,
    refreshItems: settings.options.refreshItems,
  })

  expect(refreshes).toBe(2)
  expect(writes).toHaveLength(1)
  expect(retry.messages).toEqual(['closed', 'Refreshed'])
})

test('a pin or option whose save fails is reported locally and never rejects', async () => {
  const settings = settingsOptions(
    async () => {
      throw new Error('EACCES: permission denied')
    },
    async () => {}
  )

  await handleTogglePinnedSessionWithFeedback('alpha', settings.options)
  await handleSettingOptionSubmitWithFeedback('keybindMode', 'standard', settings.options)

  expect(settings.saved).toEqual([])
  expect(settings.reports).toEqual([])
  expect(settings.messages).toHaveLength(2)

  for (const message of settings.messages) {
    expect(message).toContain('Could not save settings')
    expect(message).toContain('permission denied')
    expect(message).toContain('not changed')
  }
})

test('a settings edit whose save fails keeps the editor and its draft', async () => {
  const settings = settingsOptions(
    async () => {
      throw new Error('disk full')
    },
    async () => {}
  )

  await handleSettingsEditorSubmitWithFeedback('editor', settings.options)

  expect(settings.saved).toEqual([])
  expect(settings.opened).toEqual([])
  expect(settings.editorErrors.at(-1)).toContain('disk full')
  expect(settings.editorErrors.at(-1)).toContain('not changed')
})
