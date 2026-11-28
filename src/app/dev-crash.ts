import { useEffect, useState } from 'react'

export const SIMULATED_CRASH_MESSAGE = 'Simulated crash (MUX_SESH_DEV_CRASH=1)'

type CrashEnv = Readonly<Record<string, string | undefined>>

// A development aid for seeing the crash screen: it needs both dev mode and the crash flag, and
// fires once per process, after the first render, so the screen shows the user's theme and retry
// recovers into a working picker.
export function createSimulatedCrash(env: CrashEnv): () => void {
  const enabled = env.MUX_SESH_DEV === '1' && env.MUX_SESH_DEV_CRASH === '1'
  let fired = false

  return function useSimulatedCrash(): void {
    const [armed, setArmed] = useState(false)

    useEffect(() => {
      if (!enabled || fired) return

      setArmed(true)

      // React retries a failed render once, so the crash counts as spent only when the
      // recovery boundary has replaced this tree.
      return () => {
        fired = true
      }
    }, [])

    if (armed && !fired) throw new Error(SIMULATED_CRASH_MESSAGE)
  }
}
