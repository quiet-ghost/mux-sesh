import { expect, mock, test } from 'bun:test'
import { createAppHandlers } from '../src/app/handlers'
import { getDefaultConfig } from '../src/config'
import { createHerdrBackend } from '../src/herdr/backend'
import type { CommandRunner } from '../src/multiplexer/command'
import { workspaceToItem } from '../src/multiplexer/items'
import { INACTIVE_LAUNCH } from '../src/sessions/launch-plan'
import { ViewMode } from '../src/types'
import type { ShowToast } from '../src/app/notifications'
import { NO_GIT } from './fixtures/local-github'

const agent = workspaceToItem({
  backend: 'herdr',
  id: 'w3',
  title: 'twin',
  path: '/fixture/twin',
  isActive: false,
  unitCount: 1,
  target: { kind: 'agent', tabId: 'w3:t1', paneId: 'w3:p2' },
})

function handlersFor(runner: CommandRunner, showToast: ShowToast) {
  return createAppHandlers({
    clone: NO_GIT,
    launchGuard: { active: false },
    viewMode: ViewMode.Sessions,
    config: getDefaultConfig('/fixture'),
    backend: createHerdrBackend({ runner, insideHerdr: true }),
    items: [agent],
    sessionItems: [agent],
    cursor: 0,
    showToast,
    showOutcome: mock(() => {}),
    refreshItems: mock(async () => {}),
    refreshList: mock(async () => {}),
    regularSessions: [],
    agentSessions: [agent],
    selectedPrimaryItem: agent,
    sessionCandidateItems: [],
    projectSourceItems: [],
    closeModal: mock(() => {}),
    openRenameModal: mock(() => {}),
    openSettingsModal: mock(() => {}),
    openSettingOptions: mock(() => {}),
    setModalState: mock(() => {}),
    requestKillSession: mock(() => {}),
    setAppMode: mock(() => {}),
    setViewMode: mock(() => {}),
    setAllItems: mock(() => {}),
    setItems: mock(() => {}),
    setCursor: mock(() => {}),
    setSearchQuery: mock(() => {}),
    setAgentCursor: mock(() => {}),
    requestMarkedClose: mock(async () => {}),
    toggleMark: mock(() => {}),
    clearMarks: mock(() => {}),
    markedItems: new Map(),
    reloadSessions: mock(async () => undefined),
    saveConfig: mock(async () => {}),
    setConfig: mock(() => {}),
    setSettingEditorError: mock(() => {}),
    settingEditorValue: '',
    settingEditorPlainText: undefined,
    renameTarget: null,
    renamedValue: '',
    launchPreview: INACTIVE_LAUNCH,
    rememberedSessions: mock(() => {}),
    inventoryRevision: () => 0,
    toggleDetails: mock(() => {}),
  })
}

test('an expected backend failure while selecting is shown, not treated as a crash', async () => {
  const messages: string[] = []

  const handlers = handlersFor(
    { run: async () => ({ exitCode: 1, stdout: '', stderr: 'agent not found' }) },
    toast => messages.push(`${toast.kind}: ${toast.message}`)
  )

  await handlers.handleSelectWrapper(agent)

  expect(messages).toHaveLength(1)
  expect(messages[0]).toStartWith('error: ')
  expect(messages[0]).toContain("Herdr could not focus agent pane 'w3:p2'")
})

test('a programming error while selecting still propagates to crash handling', async () => {
  const defect = new TypeError('fixture defect')

  const handlers = handlersFor(
    {
      run: async () => {
        throw defect
      },
    },
    () => {}
  )

  expect.assertions(1)

  try {
    await handlers.handleSelectWrapper(agent)
  } catch (cause) {
    expect(cause).toBe(defect)
  }
})
