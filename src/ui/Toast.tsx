import { colors } from '@/styles/theme'

interface ToastProps {
  message: string
  visible: boolean
}

export default function Toast({ message, visible }: ToastProps) {
  if (!visible) return null

  return (
    <box
      style={{
        position: 'absolute',
        top: 1,
        right: 1,
        border: true,
        borderColor: colors.primary,
        padding: 0.3,
        paddingLeft: 0.5,
        paddingRight: 0.5,
        height: 2,
      }}
    >
      <box>
        {/* <text style={{ fg: colors.key }}>󰙎 </text> */}
        <text style={{ fg: colors.key }}> </text>
        <text style={{ fg: colors.active, marginLeft: 1 }}> {message}</text>
      </box>
    </box>
  )
}
