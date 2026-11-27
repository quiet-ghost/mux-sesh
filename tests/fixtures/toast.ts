// Reads the toast card at the top right: every row framed by its `┃` borders, word-wrapped
// lines joined back with single spaces.

// The card is anchored to the right edge, so only the last bordered span counts: a selected
// list row also starts with a `┃` bar.
const CARD_ROW = /┃([^┃]*)┃\s*$/

export function toastLinesOf(frame: string): string[] {
  return frame.split('\n').flatMap(row => {
    const match = CARD_ROW.exec(row)
    const text = match?.[1]?.trim()

    return text ? [text] : []
  })
}

export function readToast(frame: string): string | undefined {
  const lines = toastLinesOf(frame)

  return lines.length > 0 ? lines.join(' ') : undefined
}
