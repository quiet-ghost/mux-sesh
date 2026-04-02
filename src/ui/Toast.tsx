import { useTheme } from '../styles/theme'

interface ToastProps {
  message: string
  visible: boolean
}

export default function Toast({ message, visible }: ToastProps) {
  const theme = useTheme()

  if (!visible) return null

  return (
    <box
      style={{
        position: 'absolute',
        top: 1,
        right: 2,
      }}
    >
      <box
        style={{
          flexDirection: 'row',
          backgroundColor: theme.surface,
          paddingTop: 1,
        }}
      >
        <text style={{ fg: theme.action }}>▎</text>
        <text style={{ fg: theme.text, marginLeft: 1, marginRight: 1 }}>{message}</text>
        <text style={{ fg: theme.action }}>▎</text>
      </box>
    </box>
  )
}
