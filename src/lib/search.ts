import type { Item, SearchResult } from '../types'

export function calculateSearchScore(item: Item, query: string): number {
  const title = item.title.toLowerCase()
  const desc = item.desc?.toLowerCase() || ''
  const queryLower = query.toLowerCase().trim()

  if (queryLower === '') return 1

  const queryWords = queryLower.split(/\s+/)
  if (queryWords.length === 0) return 0

  let score = 0
  let matchedWords = 0

  for (const word of queryWords) {
    let wordScore = 0

    // Exact match
    if (title === word) wordScore += 1000

    // Prefix match
    if (title.startsWith(word)) wordScore += 500

    // Contains match
    if (title.includes(word)) {
      wordScore += 200
      matchedWords++
    }

    if (desc.includes(word)) {
      wordScore += 100
      matchedWords++
    }

    // Word boundary match
    if (wordScore === 0) {
      const titleWords = title.split(/[-_.\s]/)
      for (const titleWord of titleWords) {
        if (titleWord.includes(word)) {
          wordScore += 150
          matchedWords++
          break
        }
      }
    }

    score += wordScore
  }

  // Bonus for matching multiple words
  if (matchedWords > 1) {
    score += matchedWords * 100
  }

  // Bonus for matching all words
  if (matchedWords === queryWords.length) {
    score += 300
  }

  // Path depth bonus
  const pathDepth = (item.desc?.match(/\//g) || []).length
  score += (10 - pathDepth) * 10

  // Bonus for top-level projects
  if (pathDepth === 2) {
    score += 200
  }

  return matchedWords === 0 ? 0 : score
}

export function filterAndSortItems(items: Item[], query: string): Item[] {
  if (!query.trim()) return items

  const scored: SearchResult[] = items
    .map(item => ({
      item,
      score: calculateSearchScore(item, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map(({ item }) => item)
}
