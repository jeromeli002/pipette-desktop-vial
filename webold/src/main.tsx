import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import './renderer/style.css'
import i18n from './renderer/i18n'
import { App } from './renderer/App'
import { AppConfigProvider } from './renderer/hooks/useAppConfig'
import { vialAPI } from './api/vial-api'

// Inject API into window
if (typeof window !== 'undefined') {
  (window as any).vialAPI = vialAPI
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <AppConfigProvider>
          <App />
        </AppConfigProvider>
      </I18nextProvider>
    </StrictMode>,
  )
}
