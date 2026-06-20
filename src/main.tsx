import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/blinker'
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
