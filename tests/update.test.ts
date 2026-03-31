import { describe, expect, mock, test } from 'bun:test'
import type { Config, UpdateEvent } from '../src/types'
import { checkAndUpdate } from '../src/update'

const baseConfig: Config = {
  projectPaths: [],
  reposPath: '/tmp/repos',
  editor: 'nvim',
  editorCmd: 'nvim .',
  autoUpdate: true,
}

describe('checkAndUpdate', () => {
  test('emits an updated event after a successful background upgrade', async () => {
    const events: UpdateEvent[] = []

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => '1.6.0',
      isNewerVersion: () => true,
      detectInstallMethod: async () => 'npm',
      canAutoUpdate: () => true,
      performUpgrade: async () => true,
      emit: event => {
        events.push(event)
      },
    })

    expect(events).toEqual([
      {
        kind: 'updated',
        currentVersion: '1.5.0',
        version: '1.6.0',
        installMethod: 'npm',
      },
    ])
  })

  test('emits an available event when the install method cannot auto-update', async () => {
    const events: UpdateEvent[] = []

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => '1.6.0',
      isNewerVersion: () => true,
      detectInstallMethod: async () => 'unknown',
      canAutoUpdate: () => false,
      performUpgrade: mock(async () => true),
      emit: event => {
        events.push(event)
      },
    })

    expect(events).toEqual([
      {
        kind: 'available',
        currentVersion: '1.5.0',
        version: '1.6.0',
        installMethod: 'unknown',
      },
    ])
  })

  test('emits a failed event when the background upgrade fails', async () => {
    const events: UpdateEvent[] = []

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => '1.6.0',
      isNewerVersion: () => true,
      detectInstallMethod: async () => 'bun',
      canAutoUpdate: () => true,
      performUpgrade: async () => false,
      emit: event => {
        events.push(event)
      },
    })

    expect(events).toEqual([
      {
        kind: 'failed',
        currentVersion: '1.5.0',
        version: '1.6.0',
        installMethod: 'bun',
      },
    ])
  })

  test('does nothing when automatic updates are disabled', async () => {
    const emit = mock(() => {})

    await checkAndUpdate(
      {
        ...baseConfig,
        autoUpdate: false,
      },
      {
        getLatestVersion: async () => '1.6.0',
        isNewerVersion: () => true,
        detectInstallMethod: async () => 'npm',
        canAutoUpdate: () => true,
        performUpgrade: async () => true,
        emit,
      }
    )

    expect(emit).not.toHaveBeenCalled()
  })
})
