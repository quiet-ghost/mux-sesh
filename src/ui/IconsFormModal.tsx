import type { TextareaRenderable } from '@opentui/core'
import { getDialogHints, type IconsFormView } from '../app/dialog-actions'
import type { IconsFormMode } from '../app/modals'
import type { IconsFormEntry, IconsFormRow } from '../settings/settings-icons'
import { useTheme } from '../styles/theme'
import {
  getDialogContentWidth,
  getDialogRowWidth,
  getDialogWidth,
  truncateDialogText,
} from './dialog-layout'
import Modal from './Modal'
import SettingRow from './SettingRow'
import { textFieldColors } from './text-field-colors'
import { useTextareaFocus } from './use-textarea-focus'

const PREFERRED_WIDTH = 74
const DESCRIPTION = 'Changes save as you make them'
const NO_MATCHES: readonly number[] = []
const LABEL_GAP = 2

interface Props {
  entries: readonly IconsFormEntry[]
  row: IconsFormRow
  mode: IconsFormMode
  draft: string
  error: string
  columns: number
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

interface FieldProps {
  label: string
  initialValue: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

// The glyph being edited, in place of its row's value; Enter applies it, Esc puts the row back.
function IconField({ label, initialValue, textareaRef, onContentChange }: FieldProps) {
  const theme = useTheme()
  useTextareaFocus(textareaRef, [], { gotoLineEnd: true })

  return (
    <box style={{ flexDirection: 'row', height: 1, flexShrink: 0 }}>
      <text style={{ fg: theme.text, flexShrink: 0, wrapMode: 'none' }}>{`  ${label}`}</text>
      <text style={{ fg: theme.primary, flexShrink: 0, wrapMode: 'none' }}>{'› '}</text>
      <textarea
        ref={textareaRef}
        style={{ flexGrow: 1, flexShrink: 1, height: 1 }}
        {...textFieldColors(theme)}
        initialValue={initialValue}
        onContentChange={onContentChange}
        focused
        wrapMode="none"
      />
    </box>
  )
}

function formView(mode: IconsFormMode, selected: IconsFormEntry | undefined): IconsFormView {
  return mode.kind === 'editing' ? { mode: 'editing' } : { mode: 'browsing', entry: selected }
}

function detailText(mode: IconsFormMode, error: string, selected: IconsFormEntry | undefined) {
  if (error) return error

  if (mode.kind === 'saving') return 'Saving…'

  return selected?.description ?? ''
}

export default function IconsFormModal({
  entries,
  row,
  mode,
  draft,
  error,
  columns,
  textareaRef,
  onContentChange,
}: Props) {
  const theme = useTheme()
  const width = getDialogWidth(columns, PREFERRED_WIDTH)
  const contentWidth = getDialogContentWidth(width)
  const rowWidth = getDialogRowWidth(width)
  const selected = entries.find(entry => entry.row === row)
  const labelWidth = Math.max(...entries.map(entry => entry.title.length)) + LABEL_GAP

  return (
    <Modal
      title="Icons"
      description={DESCRIPTION}
      hints={getDialogHints({ kind: 'icons-form', ...formView(mode, selected) })}
      columns={columns}
      preferredWidth={PREFERRED_WIDTH}
    >
      <box style={{ flexDirection: 'column', marginTop: 1 }}>
        {entries.map(entry =>
          mode.kind === 'editing' && entry.row === mode.icon ? (
            <IconField
              key={entry.row}
              label={entry.title.padEnd(labelWidth)}
              initialValue={draft}
              textareaRef={textareaRef}
              onContentChange={onContentChange}
            />
          ) : (
            <SettingRow
              key={entry.row}
              entry={entry}
              selected={mode.kind !== 'editing' && entry.row === row}
              width={rowWidth}
              matches={NO_MATCHES}
            />
          )
        )}
      </box>

      <text wrapMode="none" style={{ fg: error ? theme.danger : theme.textMuted, marginTop: 1 }}>
        {truncateDialogText(detailText(mode, error, selected), contentWidth)}
      </text>
    </Modal>
  )
}
