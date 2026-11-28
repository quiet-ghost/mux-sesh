import type { AgentStatus, BackendKind, HerdrAgentTarget } from '../multiplexer/types'

export type ItemKind = BackendKind | 'configured' | 'project' | 'file'

export interface SearchMatchMetadata {
  titleIndices?: number[]
  descIndices?: number[]
}

export interface Item {
  title: string
  desc: string
  path: string
  isSession: boolean
  itemKind?: ItemKind
  sessionId?: string
  backend?: BackendKind
  target?: HerdrAgentTarget
  workspaceTitle?: string
  agentStatus?: AgentStatus
  icon?: string
  isPinned?: boolean
  isAttached?: boolean
  linkedSessionName?: string
  linkedSessionId?: string
  linkedSessionBackend?: BackendKind
  linkedSessionAttached?: boolean
  windowCount?: string
  createdAt?: number
  lastActivity?: number
  searchMatch?: SearchMatchMetadata
}
