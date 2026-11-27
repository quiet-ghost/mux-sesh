import { useTheme } from '../styles/theme'

interface Props {
  text: string
  // Ascending positions into `text`, as the matcher returns them.
  matchIndices?: readonly number[]
  color?: string
  highlightColor?: string
  highlightAttributes?: number
}

interface Segment {
  readonly text: string
  readonly highlighted: boolean
}

const NO_MATCHES: readonly number[] = []

// One pass over the positions: each run of consecutive positions is one highlighted slice.
function getSegments(text: string, matchIndices: readonly number[]): Segment[] {
  const segments: Segment[] = []
  let plainStart = 0
  let index = 0

  while (index < matchIndices.length) {
    const start = matchIndices[index] ?? 0
    let end = start + 1
    index++

    while (index < matchIndices.length && matchIndices[index] === end) {
      end++
      index++
    }

    if (start < plainStart || start >= text.length) continue

    const stop = Math.min(end, text.length)

    if (start > plainStart)
      segments.push({ text: text.slice(plainStart, start), highlighted: false })
    segments.push({ text: text.slice(start, stop), highlighted: true })
    plainStart = stop
  }

  if (plainStart < text.length) segments.push({ text: text.slice(plainStart), highlighted: false })

  return segments
}

export default function HighlightedText({
  text,
  matchIndices = NO_MATCHES,
  color,
  highlightColor,
  highlightAttributes,
}: Props) {
  const theme = useTheme()

  if (matchIndices.length === 0) return <span style={{ fg: color }}>{text}</span>

  const resolvedHighlightColor = highlightColor ?? theme.action

  return (
    <>
      {getSegments(text, matchIndices).map((segment, i) =>
        segment.highlighted ? (
          <span key={i} style={{ fg: resolvedHighlightColor, attributes: highlightAttributes }}>
            {segment.text}
          </span>
        ) : (
          <span key={i} style={{ fg: color }}>
            {segment.text}
          </span>
        )
      )}
    </>
  )
}
