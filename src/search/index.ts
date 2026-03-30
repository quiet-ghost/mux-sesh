import { basename } from 'path'
import type { FuzzyMatch, Item, SearchMatchMetadata, SearchResult } from '../types'

function withSearchMatch(item: Item, searchMatch?: SearchMatchMetadata): Item {
  if (!searchMatch || (!searchMatch.titleIndices && !searchMatch.descIndices)) {
    if (!item.searchMatch) {
      return item
    }

    const { searchMatch: _searchMatch, ...itemWithoutSearchMatch } = item
    return itemWithoutSearchMatch
  }

  return {
    ...item,
    searchMatch,
  }
}

/**
 * Performs fuzzy matching and returns match positions and score
 * Similar to fzf/telescope matching algorithm
 */
export function fuzzyMatch(text: string, query: string): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] }

  const textLower = text.toLowerCase()
  const queryLower = query.toLowerCase()

  const indices: number[] = []
  let textIndex = 0
  let queryIndex = 0

  while (queryIndex < queryLower.length && textIndex < textLower.length) {
    if (textLower[textIndex] === queryLower[queryIndex]) {
      indices.push(textIndex)
      queryIndex++
    }
    textIndex++
  }

  if (queryIndex !== queryLower.length) {
    return null
  }

  let score = 100

  if (text.toLowerCase() === query.toLowerCase()) {
    score += 10000
  }

  if (indices[0] === 0) {
    score += 1000
  }

  let consecutiveBonus = 0
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      consecutiveBonus += 50
    }
  }
  score += consecutiveBonus

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

  let caseBonus = 0
  for (let index = 0; index < indices.length; index += 1) {
    if (text[indices[index]] === query[index]) {
      caseBonus += 10
    }
  }
  score += caseBonus

  const firstMatchPos = indices[0]
  score -= firstMatchPos * 5
  score -= text.length * 2

  const matchPercentage = indices.length / text.length
  score += matchPercentage * 100

  return { score, indices }
}

interface ScoredSearchResult extends SearchResult {
  item: Item
}

function calculateItemBonus(item: Item, query: string): number {
  const normalizedQuery = query.toLowerCase()
  const title = item.title.toLowerCase()
  const pathBaseName = basename(item.path).toLowerCase()
  const description = item.desc.toLowerCase()

  let bonus = 0

  if (title === normalizedQuery || pathBaseName === normalizedQuery) {
    bonus += 5000
  } else if (title.startsWith(normalizedQuery) || pathBaseName.startsWith(normalizedQuery)) {
    bonus += 1200
  }

  if (item.path.toLowerCase().endsWith(`/${normalizedQuery}`) || description.endsWith(`/${normalizedQuery}`)) {
    bonus += 2000
  }

  if (!item.isSession) {
    const depth = item.path.split('/').filter(Boolean).length
    bonus -= depth * 2
  }

  return bonus
}

function buildSearchResult(item: Item, query: string): ScoredSearchResult | null {
  const queryTrimmed = query.trim()
  if (queryTrimmed === '') {
    return {
      item: withSearchMatch(item),
      score: 1,
    }
  }

  let bestScore = 0
  let hasMatch = false
  let searchMatch: SearchMatchMetadata | undefined

  const titleMatch = fuzzyMatch(item.title, queryTrimmed)
  if (titleMatch && titleMatch.score > 0) {
    searchMatch = {
      ...searchMatch,
      titleIndices: titleMatch.indices,
    }
    bestScore = Math.max(bestScore, titleMatch.score)
    hasMatch = true
  }

  if (item.desc) {
    const descMatch = fuzzyMatch(item.desc, queryTrimmed)
    if (descMatch && descMatch.score > 0) {
      searchMatch = {
        ...searchMatch,
        descIndices: descMatch.indices,
      }
      bestScore = Math.max(bestScore, descMatch.score * 0.8)
      hasMatch = true
    }
  }

  if (!hasMatch) {
    return null
  }

  return {
    item: withSearchMatch(item, searchMatch),
    score: bestScore + calculateItemBonus(item, queryTrimmed),
  }
}

export function clearMatchIndices(items: Item[]): Item[] {
  return items.map(item => withSearchMatch(item))
}

export function filterAndSortItems(items: Item[], query: string): Item[] {
  if (!query.trim()) {
    return clearMatchIndices(items)
  }

  return items
    .flatMap(item => {
      const result = buildSearchResult(item, query)
      return result ? [result] : []
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}
