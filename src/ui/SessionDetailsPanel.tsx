import type { DetailsContent, DetailsView, InspectorMode } from '../app/inspector'
import { getDetailsContent, getInspectionKey } from '../app/inspector'
import type { ProjectPreview } from '../preview/project'
import { getDetailPanelStyle, useTheme } from '../styles/theme'
import type { Item } from '../types'
import type { WorkspaceDetails } from '../multiplexer'
import { fitPath } from '../util/path-display'
import { getCompactDetails } from './session-meta'

interface Props {
  width: number
  selectedItem?: Item
  mode: InspectorMode
  view: DetailsView
  // How to ask for details, e.g. "v" or "ctrl+x v"; empty when only the palette offers it.
  inspectHint: string
}

const PANEL_PADDING_COLUMNS = 2

function formatSourceLabel(source: ProjectPreview['source']): string {
  switch (source) {
    case 'project':
      return 'Project rule'
    case 'wildcard':
      return 'Wildcard rule'
    case 'default':
      return 'Default rule'
    case 'file':
      return 'File target'
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

// One row: a long path keeps its start and end instead of wrapping or losing its tail.
function PathLine(props: { path: string; width: number; marginTop?: number }) {
  const theme = useTheme()

  return (
    <text style={{ fg: theme.fileTree, wrapMode: 'none', marginTop: props.marginTop }}>
      {fitPath(props.path, props.width)}
    </text>
  )
}

function SectionLabel(props: { children: string }) {
  const theme = useTheme()

  return <text style={{ fg: theme.textSubtle, marginTop: 1 }}>{props.children}</text>
}

function ProjectPreviewView({ preview, width }: { preview: ProjectPreview; width: number }) {
  const theme = useTheme()

  return (
    <box style={{ flexDirection: 'column' }}>
      <text style={{ fg: theme.secondary }}>{preview.sessionName}</text>
      <PathLine path={preview.path} width={width} marginTop={1} />

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
            value={preview.linkedSession.isActive ? 'active' : 'inactive'}
            color={preview.linkedSession.isActive ? theme.active : theme.textMuted}
          />
          <MetaRow
            label={preview.linkedSession.unitLabel}
            value={String(preview.linkedSession.units.length)}
          />
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

function SessionDetailsView({ details, width }: { details: WorkspaceDetails; width: number }) {
  const theme = useTheme()

  return (
    <box style={{ flexDirection: 'column' }}>
      <text style={{ fg: theme.secondary }}>{details.workspace.title}</text>

      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        <MetaRow
          label="Status"
          value={details.isActive ? 'active' : 'inactive'}
          color={details.isActive ? theme.active : theme.textMuted}
        />
        <MetaRow label={details.unitLabel} value={String(details.units.length)} />
      </box>

      <SectionLabel>{details.unitLabel}</SectionLabel>
      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        {details.units.length === 0 ? (
          <text style={{ fg: theme.textMuted }}>No {details.unitLabel.toLowerCase()} found</text>
        ) : (
          details.units.map(unit => (
            <box key={unit.id} style={{ flexDirection: 'column', marginBottom: 1 }}>
              <text style={{ fg: theme.text }}>{unit.name}</text>
              {unit.currentPath && <PathLine path={unit.currentPath} width={width} />}
              {unit.currentCommand && (
                <text style={{ fg: theme.textSubtle }}>{unit.currentCommand}</text>
              )}
            </box>
          ))
        )}
      </box>

      {details.agents.length > 0 && (
        <>
          <SectionLabel>Agents</SectionLabel>
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            {details.agents.map(agent => (
              <box key={agent.paneId} style={{ flexDirection: 'column', marginBottom: 1 }}>
                <text style={{ fg: theme.action }}>
                  {agent.name} · {agent.status}
                </text>
                {agent.cwd && <PathLine path={agent.cwd} width={width} />}
              </box>
            ))}
          </box>
        </>
      )}

      {details.previewLines && details.previewLines.length > 0 && (
        <>
          <SectionLabel>Preview</SectionLabel>
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            {details.previewLines.map((line, index) => (
              <text
                key={`${details.workspace.id}:preview:${index}`}
                style={{ fg: theme.textMuted }}
              >
                {line}
              </text>
            ))}
          </box>
        </>
      )}
    </box>
  )
}

function CompactDetailsView(props: { item: Item; inspectHint: string; width: number }) {
  const theme = useTheme()
  const compact = getCompactDetails(props.item)

  return (
    <box style={{ flexDirection: 'column' }}>
      <text style={{ fg: theme.secondary }}>{props.item.title}</text>
      {compact.path && <PathLine path={compact.path} width={props.width} marginTop={1} />}

      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        {compact.rows.map(row => (
          <MetaRow key={row.label} label={row.label} value={row.value} />
        ))}
      </box>

      <text style={{ fg: theme.textSubtle, marginTop: 1 }}>
        {`${props.inspectHint || 'ctrl+p'} · Toggle details`}
      </text>
    </box>
  )
}

function ContentView({ content, width }: { content: DetailsContent; width: number }) {
  return content.kind === 'session' ? (
    <SessionDetailsView details={content.details} width={width} />
  ) : (
    <ProjectPreviewView preview={content.preview} width={width} />
  )
}

function InspectedDetails(props: { item: Item; view: DetailsView; width: number }) {
  const theme = useTheme()
  const { item, view } = props
  const key = getInspectionKey(item)
  const content = getDetailsContent(view, key)

  // A view for another target is never shown: the selection moved and its read is pending.
  if (!content) {
    return (
      <>
        <text style={{ fg: theme.secondary }}>{item.title}</text>
        {view.kind === 'failed' && view.key === key ? (
          <text style={{ fg: theme.danger, marginTop: 1 }}>{view.message}</text>
        ) : (
          <text style={{ fg: theme.textSubtle, marginTop: 1 }}>Loading…</text>
        )}
      </>
    )
  }

  return (
    <>
      {view.kind === 'refreshing' && (
        <text style={{ fg: theme.textSubtle, marginBottom: 1 }}>Refreshing…</text>
      )}
      {view.kind === 'stale' && (
        <text style={{ fg: theme.danger, marginBottom: 1 }}>
          {`Stale: ${view.message} Showing the last details read.`}
        </text>
      )}
      <ContentView content={content} width={props.width} />
    </>
  )
}

export default function SessionDetailsPanel({
  width,
  selectedItem,
  mode,
  view,
  inspectHint,
}: Props) {
  const theme = useTheme()
  const contentWidth = Math.max(1, width - PANEL_PADDING_COLUMNS)

  const panelStyle = {
    ...getDetailPanelStyle(theme),
    width,
    flexShrink: 0,
    overflow: 'hidden' as const,
  }

  return (
    <box style={panelStyle}>
      {!selectedItem ? (
        <>
          <text style={{ fg: theme.textMuted }}>Nothing selected</text>
          <text style={{ fg: theme.textSubtle, marginTop: 1 }}>
            Pick a session or project to see details.
          </text>
        </>
      ) : mode === 'compact' ? (
        <CompactDetailsView item={selectedItem} inspectHint={inspectHint} width={contentWidth} />
      ) : (
        <InspectedDetails item={selectedItem} view={view} width={contentWidth} />
      )}
    </box>
  )
}
