import { useTerminalDimensions } from '@opentui/react'

export interface TerminalSize {
  columns: number
  rows: number
}

export function useTerminalSize(): TerminalSize {
  const { width, height } = useTerminalDimensions()

  return {
    columns: width,
    rows: height,
  }
}

const DETAIL_PANEL_MIN_COLUMNS = 120

export function shouldShowDetailPanel(columns: number, isNewSessionMode: boolean): boolean {
  if (isNewSessionMode) return false

  return columns >= DETAIL_PANEL_MIN_COLUMNS
}
