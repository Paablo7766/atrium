import { Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { readCloudSyncPref } from '@/lib/cloudSyncPref'

/** Pantalla de carga a pantalla completa (dark). */
export function AuthLoadingScreen() {
  return (
    <div className="h-full relative flex items-center justify-center bg-bg overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(600px 320px at 50% 30%, rgba(74,222,128,0.08), transparent 55%)',
        }}
      />
      <div className="relative flex flex-col items-center gap-4 animate-fade-in">
        <Loader2 size={28} className="animate-spin text-accent" />
        <p className="text-[13px] text-muted">Cargando sesión…</p>
      </div>
    </div>
  )
}

/**
 * Protege rutas del journal: sin sesión → /login solo si sync multi-dispositivo está activo.
 * Supabase configurado sin sync activado → modo local sin login.
 */
export function AuthGuard() {
  const { session, isLoading, cloudEnabled } = useAuth()
  const syncRequired = cloudEnabled && readCloudSyncPref()
  const [settled, setSettled] = useState(!isLoading)
  useEffect(() => {
    if (!isLoading) setSettled(true)
  }, [isLoading])

  // En web (Supabase) no desmontar el journal si auth revalida: eso vacía la ventana.
  if (isLoading && !settled) return <AuthLoadingScreen />

  if (syncRequired && !session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

/**
 * Ruta pública (/login): si ya hay sesión, redirige al dashboard.
 * En modo local sin Supabase también redirige al journal.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { session, isLoading, cloudEnabled } = useAuth()
  const syncRequired = cloudEnabled && readCloudSyncPref()

  if (isLoading) return <AuthLoadingScreen />

  if (!syncRequired || session) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
