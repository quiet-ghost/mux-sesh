export interface OpencodeStats {
  // Per-session stats
  sessionID?: string
  title?: string
  projectID?: string
  directory?: string
  messageCount?: number
  filesModified?: number
  additions?: number
  deletions?: number
  createdAt?: number
  updatedAt?: number
  
  // Global stats
  totalSessions?: number
  totalMessages?: number
  totalCost?: string
  costPerDay?: string
  inputTokens?: string
  outputTokens?: string
  cacheRead?: string
  cacheWrite?: string
  topTools?: Array<{ name: string; count: number; percentage: string }>
  
  // Aggregated stats (for home directory sessions)
  sessionCount?: number
  mostRecentTitle?: string
  
  // Current session live stats (last message)
  lastMessageTokens?: number
  contextLimit?: number
  sessionTotalCost?: number
}
