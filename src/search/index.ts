import type { Item, SearchResult, FuzzyMatch } from '../types'

/**
 * Performs fuzzy matching and returns match positions and score
 * Similar to fzf/telescope matching algorithm
 */
export function fuzzyMatch(text: string, query: string): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] }

  const textLower = text.toLowerCase()
  const queryLower = query.toLowerCase()

  // Track matched character positions
  const indices: number[] = []
  let textIndex = 0
  let queryIndex = 0

  // Find all query characters in order
  while (queryIndex < queryLower.length && textIndex < textLower.length) {
    if (textLower[textIndex] === queryLower[queryIndex]) {
      indices.push(textIndex)
      queryIndex++
    }
    textIndex++
  }

  // If we didn't match all characters, no match
  if (queryIndex !== queryLower.length) {
    return null
  }

  // Calculate score based on match quality
  let score = 100

  // Bonus for exact match
  if (text.toLowerCase() === query.toLowerCase()) {
    score += 10000
  }

  // Bonus for match at start
  if (indices[0] === 0) {
    score += 1000
  }

  // Bonus for consecutive characters
  let consecutiveBonus = 0
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      consecutiveBonus += 50
    }
  }
  score += consecutiveBonus

  // Bonus for matches after word boundaries (-, _, ., space, /)
  let boundaryBonus = 0
  for (const idx of indices) {
    if (idx > 0) {
      const prevChar = text[idx - 1]
      if (['-', '_', '.', ' ', '/'].includes(prevChar)) {
        boundaryBonus += 30
      }
    }
  }
  score += boundaryBonus

  // Bonus for case-sensitive exact character matches
  let caseBonus = 0
  for (const idx of indices) {
    if (text[idx] === query[indices.indexOf(idx)]) {
      caseBonus += 10
    }
  }
  score += caseBonus

  // Penalty for early gaps (characters not matched at the beginning)
  const firstMatchPos = indices[0]
  score -= firstMatchPos * 5

  // Penalty for length of text (shorter matches are better)
  score -= text.length * 2

  // Bonus for matching a higher percentage of the text
  const matchPercentage = indices.length / text.length
  score += matchPercentage * 100

  return { score, indices }
}

export function calculateSearchScore(item: Item, query: string): number {
  const queryTrimmed = query.trim()
  if (queryTrimmed === '') return 1

  let bestScore = 0
  let hasMatch = false

  // Try fuzzy matching on title
  const titleMatch = fuzzyMatch(item.title, queryTrimmed)
  if (titleMatch && titleMatch.score > 0) {
    ;(item as any).titleMatchIndices = titleMatch.indices
    bestScore = Math.max(bestScore, titleMatch.score)
    hasMatch = true
  } else {
    delete (item as any).titleMatchIndices
  }

  // Try fuzzy matching on description
  if (item.desc) {
    const descMatch = fuzzyMatch(item.desc, queryTrimmed)
    if (descMatch && descMatch.score > 0) {
      ;(item as any).descMatchIndices = descMatch.indices
      // Use the better score - prefer title matches slightly
      bestScore = Math.max(bestScore, descMatch.score * 0.8)
      hasMatch = true
    } else {
      delete (item as any).descMatchIndices
    }
  }

  return hasMatch ? bestScore : 0
}

/**
 * Clears match indices from items
 */
export function clearMatchIndices(items: Item[]): void {
  items.forEach(item => {
    delete (item as any).titleMatchIndices
    delete (item as any).descMatchIndices
  })
}

export function filterAndSortItems(items: Item[], query: string): Item[] {
  if (!query.trim()) {
    // Clear any previous match indices
    clearMatchIndices(items)
    return items
  }

  const scored: SearchResult[] = items
    .map(item => ({
      item,
      score: calculateSearchScore(item, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map(({ item }) => item)
}
