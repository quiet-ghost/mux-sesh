declare global {
  // Build-time constant defined by tools/build for compiled binaries; absent when running from source.
  const MUX_SESH_VERSION: string | undefined
}

const COMPILED_MODULE_ROOT = '/$bunfs/'

export function buildVersion(): string | undefined {
  return typeof MUX_SESH_VERSION === 'undefined' ? undefined : MUX_SESH_VERSION
}

export function isCompiledBinary(mainPath = Bun.main): boolean {
  return mainPath.startsWith(COMPILED_MODULE_ROOT)
}
