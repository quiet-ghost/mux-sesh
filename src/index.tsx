import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './app'

// Create the CLI renderer
const renderer = await createCliRenderer({
  exitOnCtrlC: false, // We handle Ctrl+C ourselves
})

// Render the app
createRoot(renderer).render(<App />)
