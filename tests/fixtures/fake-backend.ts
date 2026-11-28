import type { MultiplexerBackend } from '../../src/multiplexer/types'

function unsupported(operation: string): () => never {
  return () => {
    throw new Error(`The fake backend does not implement ${operation}`)
  }
}

// Every operation throws unless the test overrides it, so an unexpected call fails loudly.
export function unsupportedBackend(
  overrides: Partial<MultiplexerBackend> = {}
): MultiplexerBackend {
  return {
    kind: 'tmux',
    capabilities: { previousWorkspace: true },
    list: unsupported('list'),
    open: unsupported('open'),
    openOrCreate: unsupported('openOrCreate'),
    create: unsupported('create'),
    start: unsupported('start'),
    rename: unsupported('rename'),
    close: unsupported('close'),
    current: unsupported('current'),
    directory: unsupported('directory'),
    details: unsupported('details'),
    openEditor: unsupported('openEditor'),
    ...overrides,
  }
}
