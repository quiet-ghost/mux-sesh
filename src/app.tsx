import { useAppController } from './app/controller'
import { AppModalsLayer } from './app/modals-layer'
import { AppScreen } from './app/screen'
import { ThemeProvider } from './styles/theme'

export function App() {
  const { theme, screenProps, modalProps } = useAppController()

  return (
    <ThemeProvider theme={theme}>
      <AppScreen {...screenProps} />
      <AppModalsLayer {...modalProps} />
    </ThemeProvider>
  )
}
