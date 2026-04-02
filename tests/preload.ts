import { afterEach } from 'bun:test'
import { mkdir, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const root = await mkdtemp(join(tmpdir(), 'mux-sesh-test-'))
const home = join(root, 'home')
const config = join(home, '.config')
const cache = join(home, '.cache')
const state = join(home, '.local', 'state')

await Promise.all([
  mkdir(config, { recursive: true }),
  mkdir(cache, { recursive: true }),
  mkdir(state, { recursive: true }),
])

const original = {
  spawn: Bun.spawn,
  fetch: global.fetch,
  consoleError: console.error,
  HOME: process.env.HOME,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
  XDG_STATE_HOME: process.env.XDG_STATE_HOME,
  COLORFGBG: process.env.COLORFGBG,
  MUX_SESH_COLOR_SCHEME: process.env.MUX_SESH_COLOR_SCHEME,
}

function resetEnv() {
  process.env.HOME = home
  process.env.XDG_CONFIG_HOME = config
  process.env.XDG_CACHE_HOME = cache
  process.env.XDG_STATE_HOME = state

  if (original.COLORFGBG === undefined) {
    delete process.env.COLORFGBG
  } else {
    process.env.COLORFGBG = original.COLORFGBG
  }

  if (original.MUX_SESH_COLOR_SCHEME === undefined) {
    delete process.env.MUX_SESH_COLOR_SCHEME
  } else {
    process.env.MUX_SESH_COLOR_SCHEME = original.MUX_SESH_COLOR_SCHEME
  }
}

resetEnv()

afterEach(() => {
  Bun.spawn = original.spawn
  global.fetch = original.fetch
  console.error = original.consoleError
  resetEnv()
})
