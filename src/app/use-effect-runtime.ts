import { useEffect, useState } from 'react'
import { requestFatalShutdown } from '../util/shutdown'
import { createEffectRuntime, type AppEffectRuntime } from './effect-runtime'

export function useEffectRuntime(): AppEffectRuntime {
  const [runtime] = useState(createEffectRuntime)

  useEffect(
    () => () => {
      runtime.dispose().catch(requestFatalShutdown)
    },
    [runtime]
  )

  return runtime
}
