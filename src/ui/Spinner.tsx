import { createContext, memo, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { useTheme } from '../styles/theme'
import { IDLE, type PendingSignal } from '../util/pending'

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const
export const SPINNER_INTERVAL_MS = 80
const STILL_MARK = '…'

// `every` starts a repeating tick and returns what stops it; `frame` names the glyph to draw.
export type SpinnerMotion =
  | {
      readonly kind: 'animated'
      readonly every: (tick: () => void, intervalMs: number) => () => void
      readonly frame: (index: number) => string
    }
  | { readonly kind: 'still' }

export const STILL_MOTION: SpinnerMotion = { kind: 'still' }

const ANIMATED_MOTION: SpinnerMotion = {
  kind: 'animated',
  every(tick, intervalMs) {
    const interval = setInterval(tick, intervalMs)

    return () => clearInterval(interval)
  },
  frame: index => SPINNER_FRAMES[index % SPINNER_FRAMES.length] ?? STILL_MARK,
}

// MUX_SESH_NO_ANIMATION=1, or output that is not a terminal, draws a still mark and runs no timer.
export function getSpinnerMotion(
  env: Readonly<Record<string, string | undefined>>,
  isTerminal: boolean
): SpinnerMotion {
  return env.MUX_SESH_NO_ANIMATION === '1' || !isTerminal ? STILL_MOTION : ANIMATED_MOTION
}

export const SpinnerMotionContext = createContext<SpinnerMotion>(
  getSpinnerMotion(process.env, process.stdout.isTTY === true)
)

// Work the header reports as busy: inventory loads and a running clone or launch.
export const BusyContext = createContext<PendingSignal>(IDLE)

interface SpinnerProps {
  // Drawn instead of the animation when motion is off; empty when the label already says "…".
  still?: string
}

function AnimatedFrame({ motion }: { motion: Extract<SpinnerMotion, { kind: 'animated' }> }) {
  const theme = useTheme()
  const [index, setIndex] = useState(0)

  useEffect(
    () =>
      motion.every(
        () => setIndex(current => (current + 1) % SPINNER_FRAMES.length),
        SPINNER_INTERVAL_MS
      ),
    [motion]
  )

  return <span style={{ fg: theme.primary }}>{`${motion.frame(index)} `}</span>
}

// Mount only while work is pending: its interval lives exactly as long as it does, and its frames
// re-render only this span. Draws one cell and a gap.
export const Spinner = memo(function Spinner({ still = STILL_MARK }: SpinnerProps) {
  const theme = useTheme()
  const motion = useContext(SpinnerMotionContext)

  if (motion.kind === 'animated') return <AnimatedFrame motion={motion} />

  return still ? <span style={{ fg: theme.textSubtle }}>{`${still} `}</span> : null
})

// Re-renders only when the busy signal flips; idle, it renders nothing and runs no timer.
export const BusySpinner = memo(function BusySpinner() {
  const busy = useContext(BusyContext)
  const pending = useSyncExternalStore(busy.subscribe, busy.pending)

  return pending ? <Spinner /> : null
})
