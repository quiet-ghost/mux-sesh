import { useEffect, useState } from 'react'
import { getProjectPreview, type ProjectPreview } from '../preview/project'
import { getSessionDetails } from '../tmux'
import { colors, detailPanelStyle } from '../styles/theme'
import type { Config, Item, SessionDetails } from '../types'

interface Props {
  selectedItem?: Item
  config: Config | null
}

type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'session'; details: SessionDetails }
  | { status: 'project'; details: ProjectPreview }
  | { status: 'error'; message: string }

function formatSourceLabel(source: ProjectPreview['source']): string {
  switch (source) {
    case 'project':
      return 'Project Rule'
    case 'wildcard':
      return 'Wildcard Rule'
    case 'default':
      return 'Default Rule'
  }
}

function ProjectPreviewView({ preview }: { preview: ProjectPreview }) {
  return (
    <>
      <box style={{ alignItems: 'center', justifyContent: 'center' }}>
        <text style={{ fg: colors.primary, marginBottom: 1 }}>{preview.sessionName}</text>
      </box>

      <box style={{ flexDirection: 'column', marginBottom: 1, marginLeft: 2 }}>
        <text>
          Source: <span style={{ fg: colors.action }}>{formatSourceLabel(preview.source)}</span>
        </text>
        <text style={{ fg: colors.fileTree, marginTop: 1 }}>{preview.path}</text>
        {preview.gitRoot && preview.gitRoot !== preview.path && (
          <text>
            Git Root: <span style={{ fg: colors.fileTree }}>{preview.gitRoot}</span>
          </text>
        )}
        {preview.gitBranch && (
          <text>
            Branch: <span style={{ fg: colors.active }}>{preview.gitBranch}</span>
          </text>
        )}
        {preview.startupCommand && (
          <text style={{ marginTop: 1 }}>
            Startup: <span style={{ fg: colors.program }}>{preview.startupCommand}</span>
          </text>
        )}
        {preview.previewCommand && (
          <text>
            Preview Cmd: <span style={{ fg: colors.action }}>{preview.previewCommand}</span>
          </text>
        )}
      </box>

      {preview.linkedSession && (
        <>
          <box style={{ alignItems: 'center', justifyContent: 'center' }}>
            <text style={{ fg: colors.primary, marginBottom: 1 }}> Live Session</text>
          </box>

          <box style={{ flexDirection: 'column', marginBottom: 1, marginLeft: 2 }}>
            <text>
              Status:{' '}
              <span style={{ fg: preview.linkedSession.isAttached ? colors.active : colors.inactive }}>
                {preview.linkedSession.isAttached ? '● Attached' : '○ Detached'}
              </span>
            </text>
            <text>Windows: {preview.linkedSession.windowCount}</text>
            {preview.linkedSession.windows.slice(0, 4).map(window => (
              <text key={`${window.index}:${window.name}`} style={{ marginLeft: 2, fg: colors.inactive }}>
                {window.index}: {window.name}
              </text>
            ))}
          </box>
        </>
      )}

      <box style={{ alignItems: 'center', justifyContent: 'center' }}>
        <text style={{ fg: colors.primary, marginBottom: 1 }}> {preview.previewLabel}</text>
      </box>

      <box style={{ flexDirection: 'column', marginLeft: 2 }}>
        {preview.previewNotice && (
          <text style={{ fg: colors.inactive, marginBottom: 1 }}>{preview.previewNotice}</text>
        )}
        {preview.previewLines.map((line, index) => (
          <text
            key={`${preview.previewKind}:${index}:${line}`}
            style={{
              fg: preview.previewKind === 'directory' && line.endsWith('/') ? colors.fileTree : colors.text,
              marginBottom: 1,
            }}
          >
            {line}
          </text>
        ))}
      </box>
    </>
  )
}

function SessionDetailsView({ details }: { details: SessionDetails }) {
  return (
    <>
      <box style={{ alignItems: 'center', justifyContent: 'center' }}>
        <text style={{ fg: colors.primary, marginBottom: 1 }}>{details.name}</text>
      </box>

      <box style={{ flexDirection: 'column', marginBottom: 1, marginLeft: 2 }}>
        <text>
          Status:{' '}
          <span style={{ fg: details.isAttached ? colors.active : colors.inactive }}>
            {details.isAttached ? '● Active' : '○ Inactive'}
          </span>
        </text>
        <text>Windows: {details.windowCount}</text>
      </box>

      <box style={{ alignItems: 'center', justifyContent: 'center' }}>
        <text style={{ fg: colors.primary, marginBottom: 1 }}> Windows</text>
      </box>

      <box style={{ flexDirection: 'column', marginLeft: 2 }}>
        {details.windows.length === 0 ? (
          <text style={{ fg: colors.inactive }}>No windows found</text>
        ) : (
          details.windows.map(win => (
            <box key={`${win.index}:${win.name}`} style={{ flexDirection: 'column', marginBottom: 1 }}>
              <text>
                {win.index}: {win.name}
              </text>
              {win.currentCommand && (
                <text style={{ fg: colors.program, marginLeft: 2 }}> {win.currentCommand}</text>
              )}
              {win.currentPath && (
                <text style={{ fg: colors.fileTree, marginLeft: 2 }}> {win.currentPath}</text>
              )}
            </box>
          ))
        )}
      </box>
    </>
  )
}

export default function SessionDetailsPanel({ selectedItem, config }: Props) {
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false

    async function loadDetails() {
      if (!selectedItem) {
        setDetailState({ status: 'idle' })
        return
      }

      setDetailState({ status: 'loading' })

      try {
        if (selectedItem.isSession) {
          const details = await getSessionDetails(selectedItem.title)
          if (!cancelled) {
            setDetailState({ status: 'session', details })
          }
          return
        }

        if (!config) {
          if (!cancelled) {
            setDetailState({ status: 'error', message: 'Config is not loaded yet' })
          }
          return
        }

        const details = await getProjectPreview(selectedItem.path, config, selectedItem.linkedSessionName)
        if (!cancelled) {
          setDetailState({ status: 'project', details })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load details'
        if (!cancelled) {
          setDetailState({ status: 'error', message })
        }
      }
    }

    void loadDetails()

    return () => {
      cancelled = true
    }
  }, [config, selectedItem])

  const panelStyle = {
    ...detailPanelStyle,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 40,
  }

  return (
    <box style={panelStyle}>
      {detailState.status === 'idle' ? (
        <>
          <text style={{ fg: colors.primary, marginBottom: 1 }}>Details</text>
          <text style={{ fg: colors.inactive }}>No session or project selected</text>
        </>
      ) : detailState.status === 'loading' ? (
        <>
          <text style={{ fg: colors.primary, marginBottom: 1 }}>{selectedItem?.title ?? 'Details'}</text>
          <text style={{ fg: colors.inactive }}>Loading...</text>
        </>
      ) : detailState.status === 'error' ? (
        <>
          <text style={{ fg: colors.primary, marginBottom: 1 }}>{selectedItem?.title ?? 'Details'}</text>
          <text style={{ fg: colors.action }}>{detailState.message}</text>
        </>
      ) : detailState.status === 'session' ? (
        <SessionDetailsView details={detailState.details} />
      ) : (
        <ProjectPreviewView preview={detailState.details} />
      )}
    </box>
  )
}
