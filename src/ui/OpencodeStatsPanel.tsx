import { useEffect, useState } from 'react'
import { getGlobalOpencodeStats, formatSessionAge } from '../opencode'
import type { OpencodeStats } from '../opencode'
import { colors, detailPanelStyle } from '../styles/theme'
import type { Item } from '../types'

interface Props {
  selectedItem?: Item
}

export default function OpencodeStatsPanel({ selectedItem }: Props) {
  const [globalStats, setGlobalStats] = useState<OpencodeStats | null>(null)

  useEffect(() => {
    getGlobalOpencodeStats().then(setGlobalStats)
  }, [])

  const sessionStats = selectedItem?.opencodeStats

  const formatNumber = (num: number): string => {
    return num.toLocaleString()
  }

  const lastMessageTokens = sessionStats?.lastMessageTokens || 0
  const contextLimit = sessionStats?.contextLimit || 200000
  const contextPercentage =
    lastMessageTokens > 0 && contextLimit > 0
      ? Math.round((lastMessageTokens / contextLimit) * 100)
      : 0
  const sessionCost = sessionStats?.sessionTotalCost || 0

  return (
    <box style={detailPanelStyle}>
      {/* Header */}
      <box style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
        <text style={{ fg: colors.primary, marginBottom: 1 }}> OpenCode Stats</text>
      </box>

      <box style={{ flexDirection: 'row', marginBottom: 2 }}>
        {/* Current Session Column */}
        {sessionStats ? (
          sessionStats.lastMessageTokens !== undefined ? (
            <box style={{ flexDirection: 'column', marginLeft: 2, width: '50%' }}>
              <text style={{ fg: colors.key, marginBottom: 1 }}>Current Session</text>
              <text>
                Messages:{' '}
                <span style={{ fg: colors.active }}>{sessionStats.messageCount || 0}</span>
              </text>
              <text>
                Cost: <span style={{ fg: colors.action }}>${sessionCost.toFixed(2)}</span>
              </text>
              <text style={{ marginTop: 1 }}>
                Context: <span style={{ fg: colors.text }}>{formatNumber(lastMessageTokens)}</span>
                <span style={{ fg: colors.action }}>/{contextPercentage}%</span>
              </text>
            </box>
          ) : (
            <box style={{ flexDirection: 'column', marginLeft: 2, width: '50%' }}>
              <text style={{ fg: colors.inactive }}>Loading stats...</text>
            </box>
          )
        ) : (
          <box style={{ flexDirection: 'column', marginLeft: 2, width: '50%' }}>
            <text style={{ fg: colors.inactive }}>Loading stats...</text>
          </box>
        )}

        {/* Global Overview Column */}
        {globalStats && (
          <box style={{ flexDirection: 'column', marginLeft: 2 }}>
            <text style={{ fg: colors.key, marginBottom: 1 }}>Global Overview</text>
            <text>
              Sessions: <span style={{ fg: colors.active }}>{globalStats.totalSessions || 0}</span>
            </text>
            <text>
              Messages: <span style={{ fg: colors.active }}>{globalStats.totalMessages || 0}</span>
            </text>
            <text>
              Total Cost:{' '}
              <span style={{ fg: colors.action }}>{globalStats.totalCost || '$0.00'}</span>
            </text>
            <text>
              Cost/Day: <span style={{ fg: colors.text }}>{globalStats.costPerDay || '$0.00'}</span>
            </text>

            <text style={{ fg: colors.key, marginTop: 1, marginBottom: 1 }}>Token Usage</text>
            <text>
              Input: <span style={{ fg: colors.text }}>{globalStats.inputTokens || '0'}</span>
            </text>
            <text>
              Output: <span style={{ fg: colors.text }}>{globalStats.outputTokens || '0'}</span>
            </text>
            <text>
              Cache Read:{' '}
              <span style={{ fg: colors.inactive }}>{globalStats.cacheRead || '0'}</span>
            </text>
            <text>
              Cache Write:{' '}
              <span style={{ fg: colors.inactive }}>{globalStats.cacheWrite || '0'}</span>
            </text>
          </box>
        )}
      </box>

      {/* Selected Session Stats */}
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

            {/* Show session count for aggregated stats */}
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
                Files Modified:{' '}
                <span style={{ fg: colors.action }}>{sessionStats.filesModified}</span>
              </text>
            )}

            {/* Show most recent session title for aggregated stats */}
            {sessionStats.mostRecentTitle && (
              <text style={{ marginTop: 1 }}>
                <span style={{ fg: colors.key }}>Most Recent:</span> {sessionStats.mostRecentTitle}
              </text>
            )}

            {sessionStats.createdAt && (
              <text style={{ marginTop: 1 }}>
                Created:{' '}
                <span style={{ fg: colors.inactive }}>
                  {formatSessionAge(sessionStats.createdAt)}
                </span>
              </text>
            )}

            {sessionStats.updatedAt && (
              <text>
                Updated:{' '}
                <span style={{ fg: colors.inactive }}>
                  {formatSessionAge(sessionStats.updatedAt)}
                </span>
              </text>
            )}
          </box>
        </>
      )}

      {!sessionStats && (
        <box style={{ marginTop: 2, marginLeft: 2 }}>
          <text style={{ fg: colors.inactive }}>No session data found</text>
        </box>
      )}
    </box>
  )
}
