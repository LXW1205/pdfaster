import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// DESIGN §2 Type: IBM Plex Mono (display/mono) + Public Sans (body), OFL, self-hosted.
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/public-sans/400.css'
import '@fontsource/public-sans/500.css'
import '@fontsource/public-sans/600.css'
import './index.css'
// ponytail: side-effect import runs at app boot. Each annotation
// type's `AnnotationRegistry.register(...)` lives in `register.ts`.
// Promote to a typed `initializeAnnotations()` call when hot-reload
// edge cases bite (register.ts re-runs and double-registers).
import './annotations/register.ts'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
