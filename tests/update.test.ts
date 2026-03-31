import { describe, expect, mock, test } from 'bun:test'
import type { Config, UpdateEvent } from '../src/types'
import { checkAndUpdate } from '../src/update'
import { CURRENT_VERSION } from '../src/update/version'

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
    const nextVersion = '1.6.1'

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => nextVersion,
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
        currentVersion: CURRENT_VERSION,
        version: nextVersion,
        installMethod: 'npm',
      },
    ])
  })

  test('emits an available event when the install method cannot auto-update', async () => {
    const events: UpdateEvent[] = []
    const nextVersion = '1.6.1'

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => nextVersion,
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
        currentVersion: CURRENT_VERSION,
        version: nextVersion,
        installMethod: 'unknown',
      },
    ])
  })

  test('emits a failed event when the background upgrade fails', async () => {
    const events: UpdateEvent[] = []
    const nextVersion = '1.6.1'

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => nextVersion,
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
        currentVersion: CURRENT_VERSION,
        version: nextVersion,
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
        getLatestVersion: async () => '1.6.1',
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
