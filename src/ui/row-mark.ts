// Every list shows a marked row the same way: '*' in the cursor column and 'marked' in its meta,
// so a row under the cursor still reads as marked.
export function rowMarker(selected: boolean, marked: boolean): string {
  if (selected) return '› '

  return marked ? '* ' : '  '
}

export function markedMeta(marked: boolean, meta: string): string {
  if (!marked) return meta

  return meta ? `marked  ${meta}` : 'marked'
}
