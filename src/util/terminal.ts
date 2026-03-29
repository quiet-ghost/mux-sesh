import { useTerminalDimensions } from '@opentui/react'

export interface TerminalSize {
  columns: number
  rows: number
}

export type LayoutMode = 'compact' | 'normal' | 'wide'

export function useTerminalSize(): TerminalSize {
  const { width, height } = useTerminalDimensions()

  return {
    columns: width,
    rows: height,
  }
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
