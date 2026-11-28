import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import { DEV_SCREENS, parseDevScreen, planDevScreen } from '../tools/dev/screens'

const base = {
  HOME: '/home/tester',
  PATH: '/usr/local/bin:/usr/bin',
  TMUX: '/tmp/tmux-1000/default,1,0',
  TMUX_PANE: '%3',
  HERDR_ENV: '1',
  XDG_CONFIG_HOME: '/home/tester/.config',
}

const scratch = '/tmp/mux-sesh-dev-screen'
const bun = '/home/tester/.bun/bin/bun'

describe('dev failure screens', () => {
  test('every screen runs from source in dev mode without a background update', () => {
    for (const screen of DEV_SCREENS) {
      const plan = planDevScreen(screen, base, scratch, bun)

      expect(plan.env.MUX_SESH_DEV).toBe('1')
      expect(plan.env.MUX_SESH_DISABLE_AUTOUPDATE).toBe('1')
    }
  })

  test('config-error writes an invalid config into a throwaway config home', () => {
    const plan = planDevScreen('config-error', base, scratch, bun)

    expect(plan.env.XDG_CONFIG_HOME).toBe(join(scratch, 'config'))
    expect(plan.env.XDG_STATE_HOME).toBe(join(scratch, 'state'))
    expect(plan.files.map(file => file.path)).toEqual([
      join(scratch, 'config', 'mux-sesh', 'config.json'),
    ])
    expect(plan.files[0]?.contents).toContain('"backend": "zellij"')
    expect(plan.files[0]?.contents).toContain('"projects"')
  })

  test('backend-error hides tmux and Herdr: only Bun on PATH and no multiplexer session', () => {
    const plan = planDevScreen('backend-error', base, scratch, bun)

    expect(plan.env.PATH).toBe('/home/tester/.bun/bin')
    expect(plan.env).not.toHaveProperty('TMUX')
    expect(plan.env).not.toHaveProperty('TMUX_PANE')
    expect(plan.env).not.toHaveProperty('HERDR_ENV')
    expect(plan.env.XDG_CONFIG_HOME).toBe(join(scratch, 'config'))
    expect(plan.files).toEqual([])
  })

  test('crash keeps the real config, so the crash screen shows your theme', () => {
    const plan = planDevScreen('crash', base, scratch, bun)

    expect(plan.env.MUX_SESH_DEV_CRASH).toBe('1')
    expect(plan.env.XDG_CONFIG_HOME).toBe('/home/tester/.config')
    expect(plan.env.TMUX).toBe(base.TMUX)
    expect(plan.files).toEqual([])
  })

  test('an unknown screen names the ones that exist', () => {
    expect(parseDevScreen('crash')).toEqual({ kind: 'screen', screen: 'crash' })
    expect(parseDevScreen('nope')).toEqual({
      kind: 'unknown',
      message:
        'Unknown screen "nope". Choose one of: config-error, backend-error, crash. Example: bun run dev:crash',
    })
  })
})
