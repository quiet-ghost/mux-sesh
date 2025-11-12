export const colors = {
  primary: '#f38ba8',
  active: '#a6e3a1',
  inactive: '#6c7086',
  text: '#cdd6f4',
  border: '#89b4fa',
  background: '#1e1e2e',
  backgroundAlt: '#313244',
  key: '#f9e2af',
  action: '#cba6f7',
  separator: '#585b70',
  program: '#fab387',
  fileTree: '#94e2d5',
}

export const sessionListStyle = {
  border: true,
  borderStyle: 'rounded' as const,
  borderColor: colors.border,
  padding: 0.3,
  width: 65,
  height: 38,
}

export const sessionListStyleFull = {
  ...sessionListStyle,
  width: 110,
}

export const detailPanelStyle = {
  border: true,
  borderStyle: 'rounded' as const,
  borderColor: colors.border,
  padding: 0.3,
  width: 65,
  height: 38,
}

export const selectedStyle = {
  fg: colors.text,
  backgroundColor: colors.backgroundAlt,
}

export const normalStyle = {
  fg: colors.text,
}
