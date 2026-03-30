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
        right: 1,
        backgroundColor: theme.surfaceAlt,
        paddingLeft: 1,
        paddingRight: 1,
        height: 2,
      }}
    >
      <box>
        <text style={{ fg: theme.secondary }}>●</text>
        <text style={{ fg: theme.textMuted, marginLeft: 1 }}>{message}</text>
      </box>
    </box>
  )
}
