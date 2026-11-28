import { describe, expect, mock, test } from 'bun:test'
import type { Config } from '../src/config/config-model'
import type { UpdateEvent } from '../src/update/update-event'
import { checkAndUpdate, describeUpdateEvent } from '../src/update'
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
    const nextVersion = '1.6.2'

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => nextVersion,
      isNewerVersion: () => true,
      detectInstallMethod: async () => 'npm',
      canAutoUpdate: () => true,
      getInstalledVersion: async () => nextVersion,
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

  test('a mise install is told how to upgrade and never installed into', async () => {
    const events: UpdateEvent[] = []
    const performUpgrade = mock(async () => true)

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => '9.9.9',
      isNewerVersion: () => true,
      detectInstallMethod: async () => 'mise',
      performUpgrade,
      emit: event => {
        events.push(event)
      },
    })

    expect(performUpgrade).not.toHaveBeenCalled()
    expect(events).toEqual([
      {
        kind: 'available',
        currentVersion: CURRENT_VERSION,
        version: '9.9.9',
        installMethod: 'mise',
      },
    ])
    const [notice] = events

    if (!notice) throw new Error('Expected an available event')

    expect(describeUpdateEvent(notice)).toEqual({
      kind: 'info',
      message: 'Update available: v9.9.9. Run: mise upgrade npm:mux-sesh',
    })
  })

  test('update notices name the result and, when needed, the command to run', () => {
    const event = (
      kind: UpdateEvent['kind'],
      installMethod: UpdateEvent['installMethod']
    ): UpdateEvent => ({
      kind,
      currentVersion: '1.0.0',
      version: '1.1.0',
      installMethod,
    })

    expect(describeUpdateEvent(event('available', 'brew')).message).toBe(
      'Update available: v1.1.0. Run: brew upgrade mux-sesh'
    )
    expect(describeUpdateEvent(event('available', 'source')).message).toBe(
      'Update available: v1.1.0'
    )
    expect(describeUpdateEvent(event('updated', 'npm'))).toEqual({
      kind: 'success',
      message: 'Updated in background to v1.1.0. Restart mux-sesh to use it.',
    })
    expect(describeUpdateEvent(event('failed', 'bun'))).toEqual({
      kind: 'error',
      message: 'Background update to v1.1.0 failed.',
    })
  })

  test('emits an available event when the install method cannot auto-update', async () => {
    const events: UpdateEvent[] = []
    const nextVersion = '1.6.2'

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => nextVersion,
      isNewerVersion: () => true,
      detectInstallMethod: async () => 'unknown',
      canAutoUpdate: () => false,
      getInstalledVersion: async () => CURRENT_VERSION,
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
    const nextVersion = '1.6.2'

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => nextVersion,
      isNewerVersion: () => true,
      detectInstallMethod: async () => 'bun',
      canAutoUpdate: () => true,
      getInstalledVersion: async () => CURRENT_VERSION,
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
        getInstalledVersion: async () => '1.6.1',
        performUpgrade: async () => true,
        emit,
      }
    )

    expect(emit).not.toHaveBeenCalled()
  })

  test('emits available when running from a source checkout', async () => {
    const events: UpdateEvent[] = []
    const nextVersion = '1.6.2'

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => nextVersion,
      isNewerVersion: () => true,
      detectInstallMethod: async () => 'source',
      canAutoUpdate: () => false,
      getInstalledVersion: async () => CURRENT_VERSION,
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
        installMethod: 'source',
      },
    ])
  })

  test('emits failed when the install command succeeds but the running version does not change', async () => {
    const events: UpdateEvent[] = []
    const nextVersion = '1.6.2'

    await checkAndUpdate(baseConfig, {
      getLatestVersion: async () => nextVersion,
      isNewerVersion: () => true,
      detectInstallMethod: async () => 'bun',
      canAutoUpdate: () => true,
      getInstalledVersion: async () => CURRENT_VERSION,
      performUpgrade: async () => true,
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
})
