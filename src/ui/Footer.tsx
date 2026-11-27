import { memo, type ReactNode } from 'react'
import type { ActionFooter, FooterHint } from '../app/action-catalog'
import type { QueuedToast } from '../app/notifications'
import { useTheme } from '../styles/theme'
import { toastColor } from './notice-kind'
import {
  DISMISS_HINT,
  fitNotice,
  fitStatusLine,
  STATUS_PADDING_COLUMNS,
  STATUS_RIGHT_GAP,
  STATUS_WORD_GAP,
  type StatusLine,
} from './status-line'

const PADDING_COLUMNS = STATUS_PADDING_COLUMNS
const HINT_GAP = '  '

// Wider than the gap between hints, so the two groups never read as one list.
const GROUP_GAP_COLUMNS = 3
const PREFIX_WAITING = ' …'

// These lead to every other key, so they are the last screen hints a narrow footer drops.
const ANCHORS: ReadonlySet<FooterHint['id']> = new Set([
  'open-commands',
  'prefix',
  'back',
  'cancel',
])

export interface FooterProps {
  footer: ActionFooter
  width: number
  version: string
  prefixActive: boolean
  // A notice takes the hints' row while it shows; persistent status lines sit above that row.
  notice: QueuedToast | undefined
  moreNotices: number
  statusLines: readonly StatusLine[]
}

function hintWidth(hint: FooterHint, prefixActive: boolean): number {
  const key = hint.key ? hint.key.length + 1 : 0
  const waiting = prefixActive && hint.id === 'prefix' ? PREFIX_WAITING.length : 0

  return hint.label.length + key + waiting
}

function groupWidth(hints: readonly FooterHint[], prefixActive: boolean): number {
  if (hints.length === 0) return 0

  return (
    hints.reduce((sum, hint) => sum + hintWidth(hint, prefixActive), 0) +
    HINT_GAP.length * (hints.length - 1)
  )
}

// Lower is kept first. A waiting prefix outlasts the rest, since the next key depends on it.
function priority(hint: FooterHint, prefixActive: boolean): number {
  if (hint.id === 'prefix') return prefixActive ? 0 : 3

  if (hint.id === 'open-commands') return 1

  return ANCHORS.has(hint.id) ? 2 : 4
}

// The row actions and the version never shrink. Screen hints are kept by priority while they
// fit, then shown in their own order.
export function fitFooter(
  footer: ActionFooter,
  width: number,
  version: string,
  prefixActive: boolean
): ActionFooter {
  const target = groupWidth(footer.target, prefixActive)
  const right = target + (target > 0 && version ? HINT_GAP.length : 0) + version.length
  const budget = width - PADDING_COLUMNS * 2 - (right > 0 ? right + GROUP_GAP_COLUMNS : 0)

  if (groupWidth(footer.global, prefixActive) <= budget) return footer

  const ranked = footer.global
    .map((hint, index) => ({ hint, index, rank: priority(hint, prefixActive) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)

  const kept = new Set<number>()
  let used = 0

  for (const { hint, index } of ranked) {
    const cost = hintWidth(hint, prefixActive) + (kept.size > 0 ? HINT_GAP.length : 0)

    if (used + cost > budget) continue

    kept.add(index)
    used += cost
  }

  return { global: footer.global.filter((_hint, index) => kept.has(index)), target: footer.target }
}

function sameHints(left: readonly FooterHint[], right: readonly FooterHint[]): boolean {
  return (
    left.length === right.length &&
    left.every((hint, index) => {
      const other = right[index]

      return (
        other !== undefined &&
        hint.id === other.id &&
        hint.label === other.label &&
        hint.key === other.key
      )
    })
  )
}

function sameStatusLines(left: readonly StatusLine[], right: readonly StatusLine[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (line, index) => line.kind === right[index]?.kind && line.text === right[index]?.text
    )
  )
}

// The catalog builds a fresh footer every render; moving the cursor rarely changes its content.
// A queued notice keeps its identity until it leaves, so identity is enough to compare it.
function sameProps(previous: FooterProps, next: FooterProps): boolean {
  return (
    previous.width === next.width &&
    previous.version === next.version &&
    previous.prefixActive === next.prefixActive &&
    previous.notice === next.notice &&
    previous.moreNotices === next.moreNotices &&
    sameStatusLines(previous.statusLines, next.statusLines) &&
    sameHints(previous.footer.global, next.footer.global) &&
    sameHints(previous.footer.target, next.footer.target)
  )
}

// Screen hints are always there, so they recede; row actions keep a text label and a muted key.
interface HintTone {
  label: string
  key: string
}

function FooterHints({
  hints,
  prefixActive,
  tone,
}: {
  hints: readonly FooterHint[]
  prefixActive: boolean
  tone: HintTone
}) {
  const theme = useTheme()

  return hints.map((hint, index): ReactNode => {
    const gap = index > 0 ? HINT_GAP : ''
    const key = hint.key ? ` ${hint.key}` : ''

    // A waiting prefix takes the next key, so it stands out from the muted hints until then.
    if (prefixActive && hint.id === 'prefix') {
      return (
        <b key={hint.id} style={{ fg: theme.primary }}>
          {`${gap}${hint.label}${key}${PREFIX_WAITING}`}
        </b>
      )
    }

    return (
      <span key={`${hint.id}:${hint.label}`}>
        <span style={{ fg: tone.label }}>{`${gap}${hint.label}`}</span>
        {key && <span style={{ fg: tone.key }}>{key}</span>}
      </span>
    )
  })
}

const rowStyle = {
  flexDirection: 'row',
  width: '100%',
  paddingLeft: PADDING_COLUMNS,
  paddingRight: PADDING_COLUMNS,
  flexShrink: 0,
} as const

function HintRow({
  footer,
  width,
  version,
  prefixActive,
}: Pick<FooterProps, 'footer' | 'width' | 'version' | 'prefixActive'>) {
  const theme = useTheme()
  const fitted = fitFooter(footer, width, version, prefixActive)
  const versionGap = fitted.target.length > 0 ? HINT_GAP : ''

  return (
    <box style={rowStyle}>
      <text style={{ wrapMode: 'none', flexGrow: 1, flexShrink: 1 }}>
        <FooterHints
          hints={fitted.global}
          prefixActive={prefixActive}
          tone={{ label: theme.textMuted, key: theme.textSubtle }}
        />
      </text>
      <text style={{ wrapMode: 'none', flexShrink: 0 }}>
        <FooterHints
          hints={fitted.target}
          prefixActive={prefixActive}
          tone={{ label: theme.text, key: theme.textMuted }}
        />
        <span style={{ fg: theme.textSubtle }}>{`${versionGap}${version}`}</span>
      </text>
    </box>
  )
}

// A status word in its color, two spaces, then the message; the rest of a long message continues
// below, indented under it. `right` sits at the end of the first row.
function StatusRows({
  word,
  color,
  lines,
  right,
}: {
  word: string
  color: string
  lines: readonly string[]
  right?: ReactNode
}) {
  const theme = useTheme()
  const indent = ' '.repeat(word.length + STATUS_WORD_GAP.length)

  return lines.map((line, index) =>
    index === 0 ? (
      <box key={index} style={rowStyle}>
        <text style={{ wrapMode: 'none', flexGrow: 1, flexShrink: 1 }}>
          <span style={{ fg: color }}>{word}</span>
          <span style={{ fg: theme.text }}>{`${STATUS_WORD_GAP}${line}`}</span>
        </text>
        {right && <text style={{ wrapMode: 'none', flexShrink: 0 }}>{right}</text>}
      </box>
    ) : (
      <box key={index} style={rowStyle}>
        <text style={{ wrapMode: 'none', fg: theme.text }}>{`${indent}${line}`}</text>
      </box>
    )
  )
}

function NoticeRows({
  notice,
  moreNotices,
  width,
  version,
}: Pick<FooterProps, 'moreNotices' | 'width' | 'version'> & { notice: QueuedToast }) {
  const theme = useTheme()
  const layout = fitNotice(notice, moreNotices, width, version)

  return (
    <StatusRows
      word={layout.word}
      color={toastColor(theme, notice.kind)}
      lines={layout.lines}
      right={
        <>
          {layout.more && (
            <span style={{ fg: theme.textMuted }}>{`${layout.more}${STATUS_RIGHT_GAP}`}</span>
          )}
          {layout.dismiss && (
            <span style={{ fg: theme.textMuted }}>{`${DISMISS_HINT}${STATUS_RIGHT_GAP}`}</span>
          )}
          <span style={{ fg: theme.textSubtle }}>{version}</span>
        </>
      }
    />
  )
}

function FooterRow({ notice, moreNotices, statusLines, ...hints }: FooterProps) {
  const theme = useTheme()

  return (
    <>
      {statusLines.map(line => (
        <StatusRows
          key={`${line.kind}:${line.text}`}
          word={line.kind}
          color={theme.key}
          lines={fitStatusLine(line, hints.width)}
        />
      ))}
      {notice ? (
        <NoticeRows
          notice={notice}
          moreNotices={moreNotices}
          width={hints.width}
          version={hints.version}
        />
      ) : (
        <HintRow {...hints} />
      )}
    </>
  )
}

const Footer = memo(FooterRow, sameProps)

export default Footer
