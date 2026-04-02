import { describe, expect, mock, test } from 'bun:test'
import { getDefaultConfig } from '../src/config'
import { getProjectSelectionIndex, getSessionSelectionIndex } from '../src/app/data'
import { persistConfigUpdate, runWithErrorMessage } from '../src/app/operations'
import {
  getAppTitle,
  getEmptyStateMessage,
  getFooterHint,
  getStatusLabel,
  splitVisibleSessions,
} from '../src/app/view'
import { AppMode, ViewMode, type Item } from '../src/types'

describe('app view helpers', () => {
  test('splits regular and opencode sessions without losing item shape', () => {
    const items: Item[] = [
      { title: 'dev', desc: '', path: '/tmp/dev', isSession: true },
      { title: 'opencode-dev', desc: '', path: '/tmp/opencode', isSession: true },
    ]

    const split = splitVisibleSessions(items)

    expect(split.regularSessions).toHaveLength(1)
    expect(split.regularSessions[0]?.path).toBe('/tmp/dev')
    expect(split.opencodeSessions).toHaveLength(1)
    expect(split.opencodeSessions[0]?.title).toBe('opencode-dev')
  })

  test('builds title, footer, status, and empty messages from app state', () => {
    expect(getAppTitle(AppMode.NewSession, ViewMode.Projects)).toBe('New Session')
    expect(getFooterHint(AppMode.OpencodeManage, 'ctrl+x')).toContain('ctrl+x')
    expect(getStatusLabel(ViewMode.Sessions, 2, 5, 9)).toBe('2/5 active')
    expect(getEmptyStateMessage(AppMode.NewSession, 'https://github.com/acme/repo', true)).toBe(
      'Clone & create session'
    )
  })
})

describe('app data helpers', () => {
  test('restores selection indexes from remembered session and project identifiers', () => {
    const items: Item[] = [
      { title: 'alpha', desc: '', path: '/tmp/alpha', isSession: true },
      { title: 'opencode-alpha', desc: '', path: '/tmp/opencode', isSession: true },
      { title: 'beta', desc: '', path: '/tmp/beta', isSession: true },
    ]

    expect(getSessionSelectionIndex(items, 'beta')).toBe(1)
    expect(getProjectSelectionIndex(items, '/tmp/opencode')).toBe(1)
    expect(getProjectSelectionIndex([], '/tmp/missing')).toBe(0)
  })
})

describe('app operation helpers', () => {
  test('reports fallback errors through the shared message helper', async () => {
    const showMessage = mock(() => {})

    await runWithErrorMessage(
      async () => {
        throw 'boom'
      },
      'fallback message',
      showMessage
    )

    expect(showMessage).toHaveBeenCalledWith('fallback message', 3000)
  })

  test('persists config updates before refresh and success message', async () => {
    const config = getDefaultConfig('/home/tester')
    const nextConfig = { ...config, keybindMode: 'standard' as const }
    const saveConfig = mock(async () => {})
    const setConfig = mock(() => {})
    const refreshItems = mock(async () => {})
    const showMessage = mock(() => {})

    await persistConfigUpdate(
      nextConfig,
      'updated',
      saveConfig,
      setConfig,
      refreshItems,
      showMessage
    )

    expect(saveConfig).toHaveBeenCalledWith(nextConfig)
    expect(setConfig).toHaveBeenCalledWith(nextConfig)
    expect(refreshItems).toHaveBeenCalledWith(undefined, nextConfig)
    expect(showMessage).toHaveBeenCalledWith('updated')
  })
})
