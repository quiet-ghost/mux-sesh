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
      return 'Project rule'
    case 'wildcard':
      return 'Wildcard rule'
    case 'default':
      return 'Default rule'
  }
}

function MetaRow(props: { label: string; value: string; color?: string }) {
  const theme = useTheme()

  return (
    <text>
      <span style={{ fg: theme.textSubtle }}>{props.label}</span>{' '}
      <span style={{ fg: props.color ?? theme.textMuted }}>{props.value}</span>
    </text>
  )
}

function SectionLabel(props: { children: string }) {
  const theme = useTheme()
  return <text style={{ fg: theme.textSubtle, marginTop: 1 }}>{props.children}</text>
}

function ProjectPreviewView({ preview }: { preview: ProjectPreview }) {
  const theme = useTheme()

  return (
    <box style={{ flexDirection: 'column' }}>
      <text style={{ fg: theme.secondary }}>{preview.sessionName}</text>
      <text style={{ fg: theme.fileTree, marginTop: 1 }}>{preview.path}</text>

      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        <MetaRow label="Source" value={formatSourceLabel(preview.source)} color={theme.action} />
        {preview.gitBranch && (
          <MetaRow label="Branch" value={preview.gitBranch} color={theme.active} />
        )}
        {preview.startupCommand && (
          <MetaRow label="Startup" value={preview.startupCommand} color={theme.program} />
        )}
        {preview.previewCommand && (
          <MetaRow label="Preview" value={preview.previewCommand} color={theme.action} />
        )}
      </box>

      {preview.linkedSession && (
        <box style={{ flexDirection: 'column', marginTop: 1 }}>
          <SectionLabel>Live session</SectionLabel>
          <MetaRow
            label="Status"
            value={preview.linkedSession.isAttached ? 'attached' : 'detached'}
            color={preview.linkedSession.isAttached ? theme.active : theme.textMuted}
          />
          <MetaRow label="Windows" value={String(preview.linkedSession.windowCount)} />
        </box>
      )}

      <SectionLabel>{preview.previewLabel}</SectionLabel>
      {preview.previewNotice && (
        <text style={{ fg: theme.textSubtle, marginTop: 1 }}>{preview.previewNotice}</text>
      )}
      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        {preview.previewLines.slice(0, 12).map((line, index) => (
          <text
            key={`${preview.previewKind}:${index}:${line}`}
            style={{ fg: line.endsWith('/') ? theme.fileTree : theme.textMuted }}
          >
            {line}
          </text>
        ))}
      </box>
    </box>
  )
}

function SessionDetailsView({ details }: { details: SessionDetails }) {
  const theme = useTheme()

  return (
    <box style={{ flexDirection: 'column' }}>
      <text style={{ fg: theme.secondary }}>{details.name}</text>

      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        <MetaRow
          label="Status"
          value={details.isAttached ? 'active' : 'inactive'}
          color={details.isAttached ? theme.active : theme.textMuted}
        />
        <MetaRow label="Windows" value={String(details.windowCount)} />
      </box>

      <SectionLabel>Windows</SectionLabel>
      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        {details.windows.length === 0 ? (
          <text style={{ fg: theme.textMuted }}>No windows found</text>
        ) : (
          details.windows.map(win => (
            <box
              key={`${win.index}:${win.name}`}
              style={{ flexDirection: 'column', marginBottom: 1 }}
            >
              <text style={{ fg: theme.text }}>
                {win.index}: {win.name}
              </text>
              {win.currentPath && <text style={{ fg: theme.fileTree }}>{win.currentPath}</text>}
              {win.currentCommand && (
                <text style={{ fg: theme.textSubtle }}>{win.currentCommand}</text>
              )}
            </box>
          ))
        )}
      </box>

      {details.panePreviewLines && details.panePreviewLines.length > 0 && (
        <>
          <SectionLabel>Preview</SectionLabel>
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            {details.panePreviewLines.map((line, index) => (
              <text key={`${details.name}:preview:${index}`} style={{ fg: theme.textMuted }}>
                {line}
              </text>
            ))}
          </box>
        </>
      )}
    </box>
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

        const details = await getProjectPreview(
          selectedItem.path,
          config,
          selectedItem.linkedSessionName
        )
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
          <text style={{ fg: theme.textMuted }}>Nothing selected</text>
          <text style={{ fg: theme.textSubtle, marginTop: 1 }}>
            Pick a session or project to see details.
          </text>
        </>
      ) : detailState.status === 'loading' ? (
        <>
          <text style={{ fg: theme.secondary }}>{selectedItem?.title ?? 'Details'}</text>
          <text style={{ fg: theme.textSubtle, marginTop: 1 }}>Loading…</text>
        </>
      ) : detailState.status === 'error' ? (
        <>
          <text style={{ fg: theme.secondary }}>{selectedItem?.title ?? 'Details'}</text>
          <text style={{ fg: theme.danger, marginTop: 1 }}>{detailState.message}</text>
        </>
      ) : detailState.status === 'session' ? (
        <SessionDetailsView details={detailState.details} />
      ) : (
        <ProjectPreviewView preview={detailState.details} />
      )}
    </box>
  )
}
