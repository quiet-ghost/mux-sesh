import { isAbsolute } from 'path'

export function captureInvocationCwd(): string {
  const invocationCwd = process.env.MUX_SESH_INVOCATION_CWD
  // Consume the wrapper handoff so launched processes cannot inherit a stale directory.
  delete process.env.MUX_SESH_INVOCATION_CWD

  if (invocationCwd === undefined) return process.cwd()
  if (!isAbsolute(invocationCwd)) {
    throw new Error(
      'MUX_SESH_INVOCATION_CWD must be an absolute path. Unset it and launch mux-sesh again.'
    )
  }
  return invocationCwd
}
