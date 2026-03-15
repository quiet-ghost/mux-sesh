import { useEffect, useState } from 'react'
import { formatSessionAge } from '../opencode'
import { getGlobalOpencodeStats } from '../opencode/parser'
import type { OpencodeStats } from '../opencode'
import { colors, detailPanelStyle } from '../styles/theme'
import type { Item } from '../types'

interface Props {
  selectedItem?: Item
}

type GlobalStatsState =
  | { status: 'loading' }
  | { status: 'ready'; stats: OpencodeStats }
  | { status: 'error'; message: string }

function formatNumber(value: number): string {
  return value.toLocaleString()
}

export default function OpencodeStatsPanel({ selectedItem }: Props) {
  const [globalStatsState, setGlobalStatsState] = useState<GlobalStatsState>({ status: 'loading' })

  useEffect(() => {
    let disposed = false

    async function loadGlobalStats() {
      try {
        const stats = await getGlobalOpencodeStats()
        if (!disposed) {
          setGlobalStatsState({ status: 'ready', stats })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load global OpenCode stats'
        if (!disposed) {
          setGlobalStatsState({ status: 'error', message })
        }
      }
    }

    void loadGlobalStats()

    const interval = setInterval(() => {
      void loadGlobalStats()
    }, 5000)

    return () => {
      disposed = true
      clearInterval(interval)
    }
  }, [])

  const sessionState = selectedItem?.opencodeState
  const sessionStats = sessionState?.status === 'ready' ? sessionState.stats : null
  const lastMessageTokens = sessionStats?.lastMessageTokens ?? 0
  const contextLimit = sessionStats?.contextLimit ?? 200000
  const contextPercentage =
    lastMessageTokens > 0 && contextLimit > 0 ? Math.round((lastMessageTokens / contextLimit) * 100) : 0
  const sessionCost = sessionStats?.sessionTotalCost ?? 0

  const panelStyle = {
    ...detailPanelStyle,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 40,
  }

  return (
    <box style={panelStyle}>
      <box style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
        <text style={{ fg: colors.primary, marginBottom: 1 }}> OpenCode Stats</text>
      </box>

      <box style={{ flexDirection: 'row', marginBottom: 2 }}>
        <box style={{ flexDirection: 'column', marginLeft: 2, width: '50%' }}>
          <text style={{ fg: colors.key, marginBottom: 1 }}>Current Session</text>
          {sessionState?.status === 'ready' ? (
            <>
              <text>
                Messages: <span style={{ fg: colors.active }}>{sessionState.stats.messageCount ?? 0}</span>
              </text>
              <text>
                Cost: <span style={{ fg: colors.action }}>${sessionCost.toFixed(2)}</span>
              </text>
              <text style={{ marginTop: 1 }}>
                Context: <span style={{ fg: colors.text }}>{formatNumber(lastMessageTokens)}</span>
                <span style={{ fg: colors.action }}>/{contextPercentage}%</span>
              </text>
            </>
          ) : sessionState?.status === 'error' ? (
            <text style={{ fg: colors.action }}>{sessionState.message}</text>
          ) : sessionState?.status === 'missing' ? (
            <text style={{ fg: colors.inactive }}>{sessionState.message}</text>
          ) : (
            <text style={{ fg: colors.inactive }}>Loading stats...</text>
          )}
        </box>

        <box style={{ flexDirection: 'column', marginLeft: 2 }}>
          <text style={{ fg: colors.key, marginBottom: 1 }}>Global Overview</text>
          {globalStatsState.status === 'ready' ? (
            <>
              <text>
                Sessions: <span style={{ fg: colors.active }}>{globalStatsState.stats.totalSessions ?? 0}</span>
              </text>
              <text>
                Messages: <span style={{ fg: colors.active }}>{globalStatsState.stats.totalMessages ?? 0}</span>
              </text>
              <text>
                Total Cost:{' '}
                <span style={{ fg: colors.action }}>{globalStatsState.stats.totalCost ?? '$0.00'}</span>
              </text>
              <text>
                Cost/Day:{' '}
                <span style={{ fg: colors.text }}>{globalStatsState.stats.costPerDay ?? '$0.00'}</span>
              </text>

              <text style={{ fg: colors.key, marginTop: 1, marginBottom: 1 }}>Token Usage</text>
              <text>
                Input: <span style={{ fg: colors.text }}>{globalStatsState.stats.inputTokens ?? '0'}</span>
              </text>
              <text>
                Output: <span style={{ fg: colors.text }}>{globalStatsState.stats.outputTokens ?? '0'}</span>
              </text>
              <text>
                Cache Read:{' '}
                <span style={{ fg: colors.inactive }}>{globalStatsState.stats.cacheRead ?? '0'}</span>
              </text>
              <text>
                Cache Write:{' '}
                <span style={{ fg: colors.inactive }}>{globalStatsState.stats.cacheWrite ?? '0'}</span>
              </text>
            </>
          ) : globalStatsState.status === 'error' ? (
            <text style={{ fg: colors.action }}>{globalStatsState.message}</text>
          ) : (
            <text style={{ fg: colors.inactive }}>Loading stats...</text>
          )}
        </box>
      </box>

      {sessionStats && (
        <>
          <box style={{ alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            <text style={{ fg: colors.primary, marginBottom: 1 }}> Session Details</text>
          </box>

          <box style={{ flexDirection: 'column', marginLeft: 2 }}>
            {sessionStats.title && (
              <text style={{ marginBottom: 1 }}>
                <span style={{ fg: colors.key }}>Title:</span> {sessionStats.title}
              </text>
            )}

            {sessionStats.directory && (
              <text style={{ marginBottom: 1, fg: colors.fileTree }}>{sessionStats.directory}</text>
            )}

            {sessionStats.sessionCount !== undefined && (
              <text>
                Sessions: <span style={{ fg: colors.active }}>{sessionStats.sessionCount}</span>
              </text>
            )}

            {sessionStats.messageCount !== undefined && (
              <text>
                Messages: <span style={{ fg: colors.active }}>{sessionStats.messageCount}</span>
              </text>
            )}

            {sessionStats.filesModified !== undefined && sessionStats.filesModified > 0 && (
              <text>
                Files Modified: <span style={{ fg: colors.action }}>{sessionStats.filesModified}</span>
              </text>
            )}

            {sessionStats.mostRecentTitle && (
              <text style={{ marginTop: 1 }}>
                <span style={{ fg: colors.key }}>Most Recent:</span> {sessionStats.mostRecentTitle}
              </text>
            )}

            {sessionStats.createdAt && (
              <text style={{ marginTop: 1 }}>
                Created: <span style={{ fg: colors.inactive }}>{formatSessionAge(sessionStats.createdAt)}</span>
              </text>
            )}

            {sessionStats.updatedAt && (
              <text>
                Updated: <span style={{ fg: colors.inactive }}>{formatSessionAge(sessionStats.updatedAt)}</span>
              </text>
            )}
          </box>
        </>
      )}

      {!selectedItem && (
        <box style={{ marginTop: 2, marginLeft: 2 }}>
          <text style={{ fg: colors.inactive }}>No session data found</text>
        </box>
      )}
    </box>
  )
}
