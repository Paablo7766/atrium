import { useEffect, useRef, useState } from 'react'
import {
  BrowserRouter,
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { AlertTriangle, FolderOpen, History } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { readCloudSyncPref } from '@/lib/cloudSyncPref'
import { AuthGuard, AuthLoadingScreen, GuestOnly } from '@/auth/AuthGuard'
import { useStore, flushPersist, type Page } from '@/store'
import { pathForPage, pageFromPath } from '@/lib/routes'
import { Sidebar } from '@/components/Sidebar'
import { TradeModal } from '@/components/TradeModal'
import { ShareCardModal } from '@/components/ShareCard'
import { Toasts } from '@/components/Toasts'
import { Onboarding } from '@/components/Onboarding'
import { MasterPasswordUnlock } from '@/components/MasterPasswordUnlock'
import { Tour } from '@/components/Tour'
import { Dashboard } from '@/pages/Dashboard'
import { Trades } from '@/pages/Trades'
import { Calendar } from '@/pages/Calendar'
import { Analytics } from '@/pages/Analytics'
import { Journal } from '@/pages/Journal'
import { SettingsPage } from '@/pages/Settings'
import { Login } from '@/pages/Login'
import { Button, Confirm } from '@/components/ui'
import { isDesktop, listBackups, openDataFolder, restoreBackup, type JournalBackup } from '@/lib/db/client'
import { useT } from '@/lib/useI18n'
import { TradesProvider } from '@/hooks/useTrades'

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <Login />
            <Toasts />
          </GuestOnly>
        }
      />

      <Route element={<AuthGuard />}>
        {/* Una sola instancia del shell: evita remount al cambiar de página */}
        <Route path="/*" element={<ProtectedApp />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  // Electron usa file:// → HashRouter; web usa BrowserRouter (mejor con OAuth).
  const Router = isDesktop() ? HashRouter : BrowserRouter
  return (
    <Router>
      <AppRoutes />
    </Router>
  )
}

/** Journal autenticado: hidrata store, onboarding y shell con Sidebar. */
function ProtectedApp() {
  const { session, cloudEnabled } = useAuth()
  const syncRequired = cloudEnabled && readCloudSyncPref()
  const loaded = useStore((s) => s.loaded)
  const init = useStore((s) => s.init)
  const page = useStore((s) => s.page)
  const loadError = useStore((s) => s.loadError)
  const dbLocked = useStore((s) => s.dbLocked)
  const onboardingCompleted = useStore((s) => s.settings.onboardingCompleted)
  const tutorialActive = useStore((s) => s.tutorialActive)
  const openTradeModal = useStore((s) => s.openTradeModal)
  const setPage = useStore((s) => s.setPage)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const location = useLocation()
  const navigate = useNavigate()
  const syncingFromUrl = useRef(false)

  // URL ↔ store.page (la URL manda en deep-links; setPage actualiza la URL)
  useEffect(() => {
    const fromUrl = pageFromPath(location.pathname)
    if (location.pathname === '/' || location.pathname === '') {
      navigate('/dashboard', { replace: true })
      return
    }
    if (!fromUrl) {
      navigate('/dashboard', { replace: true })
      return
    }
    if (fromUrl === page) return
    syncingFromUrl.current = true
    setPage(fromUrl)
    queueMicrotask(() => {
      syncingFromUrl.current = false
    })
  }, [location.pathname, page, setPage, navigate])

  useEffect(() => {
    if (syncingFromUrl.current) return
    const expected = pathForPage(page)
    if (location.pathname !== expected) {
      navigate(expected, { replace: true })
    }
  }, [page, location.pathname, navigate])

  useEffect(() => {
    if (syncRequired && !session) return
    void init()
  }, [init, syncRequired, session])

  useEffect(() => {
    const flush = () => {
      try {
        flushPersist()
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    if (!onboardingCompleted || tutorialActive || loadError) return
    const go = (p: Page) => {
      setPage(p)
      navigate(pathForPage(p))
    }
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openTradeModal()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      const map: Record<string, Page> = {
        '1': 'dashboard',
        '2': 'trades',
        '3': 'calendar',
        '4': 'analytics',
        '5': 'journal',
        '6': 'settings',
      }
      if (map[e.key]) go(map[e.key])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onboardingCompleted, tutorialActive, loadError, openTradeModal, setPage, toggleSidebar, navigate])

  if ((syncRequired && session && !loaded) || (!syncRequired && !loaded)) {
    return <AuthLoadingScreen />
  }

  if (loadError) {
    return (
      <>
        <LoadErrorScreen message={loadError} />
        <Toasts />
      </>
    )
  }

  if (dbLocked) {
    return (
      <>
        <MasterPasswordUnlock />
        <Toasts />
      </>
    )
  }

  if (!onboardingCompleted) {
    return (
      <>
        <Onboarding />
        <Toasts />
      </>
    )
  }

  return (
    <TradesProvider>
      <div className="h-full flex bg-bg animate-fade-in">
        <Sidebar />
        <main data-tour="stage" className="flex-1 min-w-0 flex flex-col h-full stage-ambient">
          {page === 'dashboard' && <Dashboard />}
          {page === 'trades' && <Trades />}
          {page === 'calendar' && <Calendar />}
          {page === 'analytics' && <Analytics />}
          {page === 'journal' && <Journal />}
          {page === 'settings' && <SettingsPage />}
        </main>
        <TradeModal />
        <ShareCardModal />
        <Toasts />
        <Tour />
      </div>
    </TradesProvider>
  )
}

function LoadErrorScreen({ message }: { message: string }) {
  const retryLoad = useStore((s) => s.retryLoad)
  const discardCorruptFile = useStore((s) => s.discardCorruptFile)
  const toast = useStore((s) => s.toast)
  const locale = useStore((s) => s.settings.locale ?? 'es')
  const [confirm, setConfirm] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [backups, setBackups] = useState<JournalBackup[]>([])
  const t = useT()
  const latest = backups[0]

  useEffect(() => {
    if (!isDesktop()) return
    void listBackups().then(setBackups)
  }, [])

  const when = latest
    ? latest.kind === 'immediate'
      ? t('err.restoreLatest')
      : new Date(latest.mtime).toLocaleString(locale === 'en' ? 'en-GB' : 'es-ES', { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  return (
    <div className="h-full relative flex items-center justify-center bg-bg overflow-hidden p-8">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(800px 400px at 50% 30%, rgba(248,113,113,0.08), transparent 60%)' }} />
      <div className="drag-region absolute inset-x-0 top-0 h-12 z-30" />
      <div className="relative card max-w-lg w-full p-8">
        <div className="w-12 h-12 rounded-2xl bg-loss/10 border border-loss/20 flex items-center justify-center mb-5">
          <AlertTriangle className="text-loss" size={22} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {message.includes('no son recuperables') || message.includes('cannot be recovered') ? t('crypto.lostTitle') : t('err.title')}
        </h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          {message.includes('no son recuperables') || message.includes('cannot be recovered') ? t('crypto.lostBody') : t('err.body')}
        </p>
        <p className="text-[12px] text-dim mt-3 num break-all">{message}</p>
        <div className="flex flex-wrap items-center gap-2 mt-6">
          <Button variant="primary" onClick={() => void retryLoad()}>
            {t('err.retry')}
          </Button>
          {latest && (
            <Button variant="outline" onClick={() => setRestoreOpen(true)}>
              <History size={14} /> {t('err.restore')}
            </Button>
          )}
          {isDesktop() && (
            <Button variant="outline" onClick={() => void openDataFolder()}>
              <FolderOpen size={14} /> {t('err.folder')}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            {t('err.fresh')}
          </Button>
        </div>
      </div>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={discardCorruptFile}
        title={t('err.discardTitle')}
        message={t('err.discardMsg')}
        confirmLabel={t('err.discard')}
      />
      <Confirm
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onConfirm={() => {
          if (!latest) return
          void (async () => {
            const result = await restoreBackup(latest.id)
            if (!result.ok) {
              toast(result.error || t('err.restoreFail'), 'error')
              return
            }
            toast(t('err.restoreOk'), 'success')
            await retryLoad()
          })()
        }}
        title={t('err.restoreTitle')}
        message={t('err.restoreMsg', { when })}
        confirmLabel={t('err.restore')}
      />
    </div>
  )
}
