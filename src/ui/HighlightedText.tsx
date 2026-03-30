import { useTheme } from '../styles/theme'

interface Props {
  text: string
  matchIndices?: number[]
  highlightColor?: string
}

/**
 * Renders text with highlighted characters at specified indices
 * Used for fuzzy search match visualization (like fzf/telescope)
 */
export default function HighlightedText({
  text,
  matchIndices = [],
  highlightColor,
}: Props) {
  const theme = useTheme()
  const resolvedHighlightColor = highlightColor ?? theme.action

  // If no matches, return plain text
  if (matchIndices.length === 0) {
    return <>{text}</>
  }

  // Build array of text segments with their highlight status
  const segments: Array<{ text: string; highlighted: boolean }> = []
  let currentSegment = ''
  let isHighlighted = false

  for (let i = 0; i < text.length; i++) {
    const shouldHighlight = matchIndices.includes(i)

    // If highlight status changes, start a new segment
    if (shouldHighlight !== isHighlighted) {
      if (currentSegment) {
        segments.push({ text: currentSegment, highlighted: isHighlighted })
        currentSegment = ''
      }
      isHighlighted = shouldHighlight
    }

    currentSegment += text[i]
  }

  // Add the final segment
  if (currentSegment) {
    segments.push({ text: currentSegment, highlighted: isHighlighted })
  }

  return (
    <>
      {segments.map((segment, i) =>
        segment.highlighted ? (
          <span key={i} style={{ fg: resolvedHighlightColor }}>
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </>
  )
}
