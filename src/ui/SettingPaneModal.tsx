import type { TextareaRenderable } from '@opentui/core'
import type {
  AddRuleModel,
  ListPaneModel,
  PaneLine,
  RuleFormModel,
  SettingPaneModel,
} from '../app/setting-panes'
import type { RuleFormRow } from '../settings/setting-rules'
import { useTheme } from '../styles/theme'
import type { ThemeColors } from '../types'
import {
  fitsOptionalDialogRows,
  getDialogChromeRows,
  getDialogContentWidth,
  getDialogListRows,
  getDialogRowWidth,
  getDialogWidth,
  truncateDialogText,
} from './dialog-layout'
import { DialogField, DialogRow } from './DialogList'
import { getVisibleWindow } from './list-window'
import Modal from './Modal'
import { rowForeground } from './row-mark'
import { useTextareaFocus } from './use-textarea-focus'

const SETTING_PANE_WIDTH = 88

// The blank row above the rows.
const GAP_ROWS = 1

// A blank row, then the selected row's line.
const DETAIL_ROWS = 2

// Labels sit in one column, wide enough for "Startup command" and a gap.
const FORM_LABEL_COLUMNS = 18

// `‹ on ›` on the selected switch, padded alike on the others so nothing shifts.
const SWITCH_OPEN = '‹ '
const SWITCH_CLOSE = ' ›'

interface FieldProps {
  draft: string
  textareaRef: { current: TextareaRenderable | null }
  onContentChange: () => void
}

interface Props extends FieldProps {
  model: SettingPaneModel
  columns: number
  rows: number
}

function lineColor(theme: ThemeColors, line: PaneLine): string {
  switch (line.tone) {
    case 'muted':
      return theme.textMuted
    case 'text':
      return theme.text
    case 'danger':
      return theme.danger
  }
}

function DetailLine({ line, width }: { line: PaneLine | undefined; width: number }) {
  const theme = useTheme()

  if (!line) return null

  return (
    <box style={{ flexDirection: 'column', marginTop: 1 }}>
      <text wrapMode="none" style={{ fg: lineColor(theme, line) }}>
        {truncateDialogText(line.text, width)}
      </text>
    </box>
  )
}

// How many rows the list gets, and whether the detail line fits under it.
interface PaneBudget {
  readonly list: number
  readonly detail: boolean
}

function listRows(rows: number, description: string): PaneBudget {
  const reserved = getDialogChromeRows({ description }) + GAP_ROWS
  const detail = fitsOptionalDialogRows(rows, reserved, DETAIL_ROWS)

  return { list: getDialogListRows(rows, reserved + (detail ? DETAIL_ROWS : 0)), detail }
}

// One row per entry with what it does now, then the add and JSON rows. The open field takes the
// place of the row it edits, or of the add row.
function ListPane({ model, columns, rows, ...field }: Props & { model: ListPaneModel }) {
  const width = getDialogWidth(columns, SETTING_PANE_WIDTH)
  const budget = listRows(rows, model.description)
  const visible = getVisibleWindow([...model.rows], model.cursor, budget.list)

  return (
    <Modal
      title={model.title}
      description={model.description}
      hints={model.hints}
      columns={columns}
      preferredWidth={SETTING_PANE_WIDTH}
    >
      <box style={{ flexDirection: 'column', marginTop: GAP_ROWS }}>
        {visible.items.map((row, offset) => {
          const index = visible.startIndex + offset

          if (index === model.fieldRow) {
            return (
              <DialogField
                key={`field:${row.key}`}
                initialValue={field.draft}
                placeholder={model.placeholder}
                textareaRef={field.textareaRef}
                onContentChange={field.onContentChange}
              />
            )
          }

          return (
            <DialogRow
              key={row.key}
              label={row.label}
              value={row.kind === 'item' ? row.value : ''}
              selected={model.fieldRow === undefined && index === model.cursor}
              width={getDialogRowWidth(width)}
            />
          )
        })}
      </box>

      {budget.detail && <DetailLine line={model.detail} width={getDialogContentWidth(width)} />}
    </Modal>
  )
}

// A new rule's path or pattern, asked for before the rule exists.
function AddRulePane({ model, columns, ...field }: Props & { model: AddRuleModel }) {
  const width = getDialogWidth(columns, SETTING_PANE_WIDTH)

  return (
    <Modal
      title={model.title}
      description={model.description}
      hints={model.hints}
      columns={columns}
      preferredWidth={SETTING_PANE_WIDTH}
    >
      <box style={{ flexDirection: 'column', marginTop: GAP_ROWS }}>
        <DialogField
          initialValue={field.draft}
          placeholder={model.placeholder}
          textareaRef={field.textareaRef}
          onContentChange={field.onContentChange}
        />
      </box>

      <DetailLine line={model.detail} width={getDialogContentWidth(width)} />
    </Modal>
  )
}

function switchCell(text: string, selected: boolean): string {
  return selected ? `${SWITCH_OPEN}${text}${SWITCH_CLOSE}` : `  ${text}  `
}

interface FormRowProps {
  row: RuleFormRow
  selected: boolean
  width: number
}

// A label, then its value; an unset value shows what it inherits, muted.
function FormRow({ row, selected, width }: FormRowProps) {
  const theme = useTheme()
  const label = `  ${row.label.padEnd(FORM_LABEL_COLUMNS)}`
  const valueWidth = Math.max(0, width - label.length)
  const valueColor = row.value.kind === 'inherited' ? theme.textMuted : theme.text

  return (
    <box
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: selected ? theme.selection : 'transparent',
        paddingRight: 1,
      }}
    >
      <text style={{ wrapMode: 'none' }}>
        <span style={{ fg: rowForeground(theme, selected, theme.text) }}>{label}</span>
        {row.control === 'edit' && (
          <span style={{ fg: rowForeground(theme, selected, valueColor) }}>
            {truncateDialogText(row.value.text, valueWidth)}
          </span>
        )}
      </text>
      {row.control === 'toggle' && (
        <text style={{ fg: rowForeground(theme, selected, valueColor), wrapMode: 'none' }}>
          {switchCell(row.value.text, selected)}
        </text>
      )}
    </box>
  )
}

function FormField({ row, ...field }: FieldProps & { row: RuleFormRow }) {
  const theme = useTheme()

  return (
    <box style={{ flexDirection: 'row', flexShrink: 0 }}>
      <text style={{ fg: theme.text, flexShrink: 0, wrapMode: 'none' }}>
        {`  ${row.label.padEnd(FORM_LABEL_COLUMNS)}`}
      </text>
      <box style={{ flexGrow: 1, flexShrink: 1 }}>
        <DialogField
          initialValue={field.draft}
          textareaRef={field.textareaRef}
          onContentChange={field.onContentChange}
        />
      </box>
    </box>
  )
}

// One rule's fields; each saves as soon as it is applied.
function RuleFormPane({ model, columns, rows, ...field }: Props & { model: RuleFormModel }) {
  const width = getDialogWidth(columns, SETTING_PANE_WIDTH)
  const budget = listRows(rows, model.description)
  const visible = getVisibleWindow([...model.rows], model.cursor, budget.list)

  return (
    <Modal
      title={model.title}
      description={model.description}
      hints={model.hints}
      columns={columns}
      preferredWidth={SETTING_PANE_WIDTH}
    >
      <box style={{ flexDirection: 'column', marginTop: GAP_ROWS }}>
        {visible.items.map((row, offset) => {
          const index = visible.startIndex + offset

          return index === model.fieldRow ? (
            <FormField key={`field:${row.field}`} row={row} {...field} />
          ) : (
            <FormRow
              key={row.field}
              row={row}
              selected={model.fieldRow === undefined && index === model.cursor}
              width={getDialogContentWidth(width) - 1}
            />
          )
        })}
      </box>

      {budget.detail && <DetailLine line={model.detail} width={getDialogContentWidth(width)} />}
    </Modal>
  )
}

// The pane a list or rules setting opens instead of the JSON editor.
export default function SettingPaneModal(props: Props) {
  const { model, textareaRef } = props
  const fieldKey = model.kind === 'add-rule' ? 'add' : model.fieldRow
  useTextareaFocus(textareaRef, [model.kind, fieldKey])

  switch (model.kind) {
    case 'list':
      return <ListPane {...props} model={model} />
    case 'add-rule':
      return <AddRulePane {...props} model={model} />
    case 'rule-form':
      return <RuleFormPane {...props} model={model} />
  }
}
