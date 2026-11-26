import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as SchemaIssue from 'effect/SchemaIssue'
import * as SchemaTransformation from 'effect/SchemaTransformation'
import { MultiplexerError, type AgentStatus } from '../multiplexer'

export interface HerdrWorkspace {
  id: string
  label: string
  focused: boolean
  tabCount: number
  activeTabId: string
  agentStatus: AgentStatus
  worktreePath?: string
}

export interface HerdrTab {
  id: string
  workspaceId: string
  number: number
  label: string
}

export interface HerdrPane {
  id: string
  workspaceId: string
  tabId: string
  focused: boolean
  agentStatus: AgentStatus
  cwd?: string
  foregroundCwd?: string
  displayAgent?: string
  label?: string
  title?: string
}

export interface HerdrAgent {
  paneId: string
  workspaceId: string
  tabId: string
  status: AgentStatus
  name?: string
  agent?: string
  displayAgent?: string
  cwd?: string
  foregroundCwd?: string
}

export interface HerdrLayout {
  workspaceId: string
  tabId: string
  focusedPaneId: string
}

export interface HerdrSnapshot {
  focusedWorkspaceId?: string
  focusedTabId?: string
  focusedPaneId?: string
  workspaces: HerdrWorkspace[]
  tabs: HerdrTab[]
  panes: HerdrPane[]
  layouts: HerdrLayout[]
  agents: HerdrAgent[]
}

export interface HerdrCreatedWorkspace {
  workspaceId: string
  workspaceTitle: string
  rootPaneId: string
}

export interface HerdrCreatedTab {
  tabId: string
  rootPaneId: string
}

export interface HerdrStatus {
  running: boolean
  compatible?: boolean
  protocol?: number
}

export const MIN_SUPPORTED_HERDR_PROTOCOL = 17

const AGENT_STATUSES = [
  'idle',
  'working',
  'blocked',
  'done',
  'unknown',
] as const satisfies readonly AgentStatus[]

const RequiredText = Schema.String.check(Schema.isNonEmpty({ expected: 'a non-empty string' }))

const isText = Schema.is(RequiredText)

const isBoolean = Schema.is(Schema.Boolean)

const isNumber = Schema.is(Schema.Finite)

const isAgentStatus = Schema.is(Schema.Literals(AGENT_STATUSES))

// Herdr omits, nulls, or blanks optional fields, so unusable values decode as absent.
const OptionalText = Schema.optionalKey(Schema.Unknown).pipe(
  Schema.decodeTo(
    Schema.optionalKey(Schema.String),
    SchemaTransformation.transformOptional({
      decode: value => Option.filter(value, isText),
      encode: value => value,
    })
  )
)

const OptionalBoolean = Schema.optionalKey(Schema.Unknown).pipe(
  Schema.decodeTo(
    Schema.optionalKey(Schema.Boolean),
    SchemaTransformation.transformOptional({
      decode: value => Option.filter(value, isBoolean),
      encode: value => value,
    })
  )
)

const OptionalNumber = Schema.optionalKey(Schema.Unknown).pipe(
  Schema.decodeTo(
    Schema.optionalKey(Schema.Finite),
    SchemaTransformation.transformOptional({
      decode: value => Option.filter(value, isNumber),
      encode: value => value,
    })
  )
)

const Status = Schema.optionalKey(Schema.Unknown).pipe(
  Schema.decodeTo(
    Schema.Literals(AGENT_STATUSES),
    SchemaTransformation.transformOptional({
      decode: value =>
        Option.some(
          Option.getOrElse(Option.filter(value, isAgentStatus), (): AgentStatus => 'unknown')
        ),
      encode: value => value,
    })
  )
)

const WorktreePath = Schema.optionalKey(
  Schema.Struct({ checkout_path: OptionalText }).pipe(
    Schema.decodeTo(
      Schema.UndefinedOr(Schema.String),
      SchemaTransformation.transform({
        decode: worktree => worktree.checkout_path,
        encode: checkoutPath => ({ checkout_path: checkoutPath }),
      })
    )
  )
)

const Workspace = Schema.Struct({
  id: RequiredText,
  label: RequiredText,
  focused: Schema.Boolean,
  tabCount: Schema.Finite,
  activeTabId: RequiredText,
  agentStatus: Status,
  worktreePath: WorktreePath,
}).pipe(
  Schema.encodeKeys({
    id: 'workspace_id',
    tabCount: 'tab_count',
    activeTabId: 'active_tab_id',
    agentStatus: 'agent_status',
    worktreePath: 'worktree',
  })
)

const Tab = Schema.Struct({
  id: RequiredText,
  workspaceId: RequiredText,
  number: Schema.Finite,
  label: RequiredText,
}).pipe(Schema.encodeKeys({ id: 'tab_id', workspaceId: 'workspace_id' }))

const Pane = Schema.Struct({
  id: RequiredText,
  workspaceId: RequiredText,
  tabId: RequiredText,
  focused: Schema.Boolean,
  agentStatus: Status,
  cwd: OptionalText,
  foregroundCwd: OptionalText,
  displayAgent: OptionalText,
  label: OptionalText,
  title: OptionalText,
}).pipe(
  Schema.encodeKeys({
    id: 'pane_id',
    workspaceId: 'workspace_id',
    tabId: 'tab_id',
    agentStatus: 'agent_status',
    foregroundCwd: 'foreground_cwd',
    displayAgent: 'display_agent',
  })
)

const Agent = Schema.Struct({
  paneId: RequiredText,
  workspaceId: RequiredText,
  tabId: RequiredText,
  status: Status,
  name: OptionalText,
  agent: OptionalText,
  displayAgent: OptionalText,
  cwd: OptionalText,
  foregroundCwd: OptionalText,
}).pipe(
  Schema.encodeKeys({
    paneId: 'pane_id',
    workspaceId: 'workspace_id',
    tabId: 'tab_id',
    status: 'agent_status',
    displayAgent: 'display_agent',
    foregroundCwd: 'foreground_cwd',
  })
)

const Layout = Schema.Struct({
  workspaceId: RequiredText,
  tabId: RequiredText,
  focusedPaneId: RequiredText,
}).pipe(
  Schema.encodeKeys({
    workspaceId: 'workspace_id',
    tabId: 'tab_id',
    focusedPaneId: 'focused_pane_id',
  })
)

const Snapshot = Schema.Struct({
  focusedWorkspaceId: OptionalText,
  focusedTabId: OptionalText,
  focusedPaneId: OptionalText,
  workspaces: Schema.mutable(Schema.Array(Workspace)),
  tabs: Schema.mutable(Schema.Array(Tab)),
  panes: Schema.mutable(Schema.Array(Pane)),
  layouts: Schema.mutable(Schema.Array(Layout)),
  agents: Schema.mutable(Schema.Array(Agent)),
}).pipe(
  Schema.encodeKeys({
    focusedWorkspaceId: 'focused_workspace_id',
    focusedTabId: 'focused_tab_id',
    focusedPaneId: 'focused_pane_id',
  })
)

const RootPane = Schema.Struct({ pane_id: RequiredText })

const RejectedRequest = Schema.Struct({ message: OptionalText })

const StatusResponse = Schema.fromJsonString(
  Schema.Struct({
    server: Schema.Struct({
      running: Schema.Boolean,
      compatible: OptionalBoolean,
      protocol: OptionalNumber,
    }),
  })
)

function invalid(message: string): never {
  throw new MultiplexerError(
    'invalid-response',
    `Herdr returned an invalid response: ${message}. Run 'herdr status --json' to verify the server and protocol.`
  )
}

const formatIssue = SchemaIssue.makeFormatterDefault()

interface LocatedIssue {
  path: ReadonlyArray<PropertyKey>
  issue: SchemaIssue.Issue
}

function firstIssue(issue: SchemaIssue.Issue, path: ReadonlyArray<PropertyKey>): LocatedIssue {
  switch (issue._tag) {
    case 'Pointer':
      return firstIssue(issue.issue, [...path, ...issue.path])
    case 'Encoding':
      return firstIssue(issue.issue, path)
    case 'Composite':
    case 'AnyOf': {
      const [first] = issue.issues

      return first ? firstIssue(first, path) : { path, issue }
    }

    case 'Filter':
    case 'Forbidden':
    case 'InvalidType':
    case 'InvalidValue':
    case 'MissingKey':
    case 'OneOf':
    case 'UnexpectedKey':
      return { path, issue }
  }
}

function issuePath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .map((key, index) =>
      Number.isInteger(key) ? `[${String(key)}]` : `${index === 0 ? '' : '.'}${String(key)}`
    )
    .join('')
}

function invalidAt(issue: SchemaIssue.Issue, path: ReadonlyArray<PropertyKey>): never {
  const located = firstIssue(issue, path)
  const field = located.path.length === 0 ? 'response' : issuePath(located.path)

  return invalid(`${field}: ${formatIssue(located.issue)}`)
}

function decode<T>(schema: Schema.ConstraintDecoder<T>, output: string): T {
  const decoded = Schema.decodeUnknownResult(schema)(output)

  if (Result.isSuccess(decoded)) return decoded.success

  if (decoded.failure.issue._tag === 'Encoding') return invalid('output was not valid JSON')

  return invalidAt(decoded.failure.issue, [])
}

// The error envelope decodes first so a rejection wins over whatever `result` holds.
const Envelope = Schema.fromJsonString(
  Schema.Struct({
    error: Schema.optionalKey(RejectedRequest),
    result: Schema.optionalKey(Schema.Unknown),
  })
)

function decodeResult<T>(schema: Schema.ConstraintDecoder<T>, output: string): T {
  const envelope = decode(Envelope, output)

  if (envelope.error) {
    throw new MultiplexerError(
      'command-failed',
      `Herdr rejected the request: ${envelope.error.message ?? 'unknown Herdr API error'}`
    )
  }

  if (envelope.result === undefined) return invalid('result: Missing key')

  const result = Schema.decodeUnknownResult(schema)(envelope.result)

  return Result.isSuccess(result) ? result.success : invalidAt(result.failure.issue, ['result'])
}

const SnapshotResult = Schema.Struct({
  type: Schema.Literal('session_snapshot'),
  snapshot: Snapshot,
})

const CreatedWorkspaceResult = Schema.Struct({
  type: Schema.Literal('workspace_created'),
  workspace: Schema.Struct({ workspace_id: RequiredText, label: RequiredText }),
  root_pane: RootPane,
})

const CreatedTabResult = Schema.Struct({
  type: Schema.Literal('tab_created'),
  tab: Schema.Struct({ tab_id: RequiredText }),
  root_pane: RootPane,
})

// Agents become focus targets, so each must name a pane that exists in its own tab and workspace.
function checkAgentReferences(snapshot: HerdrSnapshot): HerdrSnapshot {
  const workspaceIds = new Set(snapshot.workspaces.map(workspace => workspace.id))

  for (const agent of snapshot.agents) {
    if (!workspaceIds.has(agent.workspaceId)) {
      invalid(`agent pane '${agent.paneId}' names missing workspace '${agent.workspaceId}'`)
    }

    const pane = snapshot.panes.find(entry => entry.id === agent.paneId)

    if (!pane || pane.tabId !== agent.tabId || pane.workspaceId !== agent.workspaceId) {
      invalid(
        `agent pane '${agent.paneId}' is not a pane of tab '${agent.tabId}' in workspace '${agent.workspaceId}'`
      )
    }
  }

  return snapshot
}

export function parseHerdrSnapshot(output: string): HerdrSnapshot {
  return checkAgentReferences(decodeResult(SnapshotResult, output).snapshot)
}

export function parseHerdrResult(output: string, expectedType: string): { readonly type: string } {
  return decodeResult(Schema.Struct({ type: Schema.Literal(expectedType) }), output)
}

export function parseHerdrCreatedWorkspace(output: string): HerdrCreatedWorkspace {
  const result = decodeResult(CreatedWorkspaceResult, output)

  return {
    workspaceId: result.workspace.workspace_id,
    workspaceTitle: result.workspace.label,
    rootPaneId: result.root_pane.pane_id,
  }
}

export function parseHerdrCreatedTab(output: string): HerdrCreatedTab {
  const result = decodeResult(CreatedTabResult, output)

  return { tabId: result.tab.tab_id, rootPaneId: result.root_pane.pane_id }
}

export function parseHerdrStatus(output: string): HerdrStatus {
  return decode(StatusResponse, output).server
}
