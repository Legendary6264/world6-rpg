import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import OnlineProvider from './OnlineProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OnlineProvider><App /></OnlineProvider>
  </StrictMode>,
)
