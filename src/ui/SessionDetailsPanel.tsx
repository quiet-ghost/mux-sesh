import { useEffect, useState } from 'react'
import { getProjectPreview, type ProjectPreview } from '../preview/project'
import { getSessionDetails } from '../tmux'
import { getDetailPanelStyle, useTheme } from '../styles/theme'
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
  const theme = useTheme()

  return (
    <>
      <box style={{ alignItems: 'center', justifyContent: 'center' }}>
        <text style={{ fg: theme.primary, marginBottom: 1 }}>{preview.sessionName}</text>
      </box>

      <box style={{ flexDirection: 'column', marginBottom: 1, marginLeft: 2 }}>
        <text>
          Source: <span style={{ fg: theme.action }}>{formatSourceLabel(preview.source)}</span>
        </text>
        <text style={{ fg: theme.fileTree, marginTop: 1 }}>{preview.path}</text>
        {preview.gitRoot && preview.gitRoot !== preview.path && (
          <text>
            Git Root: <span style={{ fg: theme.fileTree }}>{preview.gitRoot}</span>
          </text>
        )}
        {preview.gitBranch && (
          <text>
            Branch: <span style={{ fg: theme.active }}>{preview.gitBranch}</span>
          </text>
        )}
        {preview.startupCommand && (
          <text style={{ marginTop: 1 }}>
            Startup: <span style={{ fg: theme.program }}>{preview.startupCommand}</span>
          </text>
        )}
        {preview.previewCommand && (
          <text>
            Preview Cmd: <span style={{ fg: theme.action }}>{preview.previewCommand}</span>
          </text>
        )}
      </box>

      {preview.linkedSession && (
        <>
          <box style={{ alignItems: 'center', justifyContent: 'center' }}>
            <text style={{ fg: theme.primary, marginBottom: 1 }}> Live Session</text>
          </box>

          <box style={{ flexDirection: 'column', marginBottom: 1, marginLeft: 2 }}>
            <text>
              Status:{' '}
              <span style={{ fg: preview.linkedSession.isAttached ? theme.active : theme.inactive }}>
                {preview.linkedSession.isAttached ? '● Attached' : '○ Detached'}
              </span>
            </text>
            <text>Windows: {preview.linkedSession.windowCount}</text>
            {preview.linkedSession.windows.slice(0, 4).map(window => (
              <text key={`${window.index}:${window.name}`} style={{ marginLeft: 2, fg: theme.inactive }}>
                {window.index}: {window.name}
              </text>
            ))}
          </box>
        </>
      )}

      <box style={{ alignItems: 'center', justifyContent: 'center' }}>
        <text style={{ fg: theme.primary, marginBottom: 1 }}> {preview.previewLabel}</text>
      </box>

      <box style={{ flexDirection: 'column', marginLeft: 2 }}>
        {preview.previewNotice && <text style={{ fg: theme.inactive, marginBottom: 1 }}>{preview.previewNotice}</text>}
        {preview.previewLines.map((line, index) => (
          <text
            key={`${preview.previewKind}:${index}:${line}`}
            style={{
              fg: preview.previewKind === 'directory' && line.endsWith('/') ? theme.fileTree : theme.text,
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
  const theme = useTheme()

  return (
    <>
      <box style={{ alignItems: 'center', justifyContent: 'center' }}>
        <text style={{ fg: theme.primary, marginBottom: 1 }}>{details.name}</text>
      </box>

      <box style={{ flexDirection: 'column', marginBottom: 1, marginLeft: 2 }}>
        <text>
          Status: <span style={{ fg: details.isAttached ? theme.active : theme.inactive }}>{details.isAttached ? '● Active' : '○ Inactive'}</span>
        </text>
        <text>Windows: {details.windowCount}</text>
      </box>

      <box style={{ alignItems: 'center', justifyContent: 'center' }}>
        <text style={{ fg: theme.primary, marginBottom: 1 }}> Windows</text>
      </box>

      <box style={{ flexDirection: 'column', marginLeft: 2 }}>
        {details.windows.length === 0 ? (
          <text style={{ fg: theme.inactive }}>No windows found</text>
        ) : (
          details.windows.map(win => (
            <box key={`${win.index}:${win.name}`} style={{ flexDirection: 'column', marginBottom: 1 }}>
              <text>
                {win.index}: {win.name}
              </text>
              {win.currentCommand && <text style={{ fg: theme.program, marginLeft: 2 }}> {win.currentCommand}</text>}
              {win.currentPath && <text style={{ fg: theme.fileTree, marginLeft: 2 }}> {win.currentPath}</text>}
            </box>
          ))
        )}
      </box>
    </>
  )
}

export default function SessionDetailsPanel({ selectedItem, config }: Props) {
  const theme = useTheme()
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
    ...getDetailPanelStyle(theme),
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 40,
  }

  return (
    <box style={panelStyle}>
      {detailState.status === 'idle' ? (
        <>
          <text style={{ fg: theme.primary, marginBottom: 1 }}>Details</text>
          <text style={{ fg: theme.inactive }}>No session or project selected</text>
        </>
      ) : detailState.status === 'loading' ? (
        <>
          <text style={{ fg: theme.primary, marginBottom: 1 }}>{selectedItem?.title ?? 'Details'}</text>
          <text style={{ fg: theme.inactive }}>Loading...</text>
        </>
      ) : detailState.status === 'error' ? (
        <>
          <text style={{ fg: theme.primary, marginBottom: 1 }}>{selectedItem?.title ?? 'Details'}</text>
          <text style={{ fg: theme.action }}>{detailState.message}</text>
        </>
      ) : detailState.status === 'session' ? (
        <SessionDetailsView details={detailState.details} />
      ) : (
        <ProjectPreviewView preview={detailState.details} />
      )}
    </box>
  )
}
