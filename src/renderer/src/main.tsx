import './assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './assets/workspace.css'
import './assets/workspace-controls.css'
import { installDesktopBridge } from './lib/desktopBridge'
import './assets/app-dialogs.css'

installDesktopBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
