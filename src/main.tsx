import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from '@/auth/AuthProvider'
import { isDesktop } from '@/lib/db/client'
import { registerAtriumServiceWorker } from '@/lib/web/shareImport'
import { useStore } from '@/store'

if (!isDesktop()) registerAtriumServiceWorker()

if (import.meta.env.DEV) {
  // Acceso al store desde DevTools en desarrollo
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
