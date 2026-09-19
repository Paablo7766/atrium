import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from '@/auth/AuthProvider'
import { useStore } from '@/store'

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
