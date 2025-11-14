import { useState, useEffect } from 'react'

export interface TerminalSize {
  columns: number
  rows: number
}

export type LayoutMode = 'compact' | 'normal' | 'wide'

export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  })

  useEffect(() => {
    const handler = () => {
      setSize({
        columns: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
      })
    }

    process.stdout.on('resize', handler)
    return () => {
      process.stdout.off('resize', handler)
    }
  }, [])

  return size
}

export function getLayoutMode(columns: number): LayoutMode {
  if (columns < 100) return 'compact'
  if (columns < 150) return 'normal'
  return 'wide'
}

export function shouldShowDetailPanel(columns: number, isNewSessionMode: boolean): boolean {
  if (isNewSessionMode) return false
  return columns >= 80
}
