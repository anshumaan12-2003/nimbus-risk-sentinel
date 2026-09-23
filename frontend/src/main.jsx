import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/app.css'
// Fonts are bundled, not fetched from Google: works offline, no third-party request from a
// security tool, and screenshots are identical everywhere (visual regression tests depend on it).
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
