import { useState, type FormEvent, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { Loader2, Lock, Mail } from 'lucide-react'
import { BrandLockup } from '@/components/BrandMark'
import { Button, Field } from '@/components/ui'
import { useAuth, validatePassword } from '@/auth/AuthProvider'
import { useStore } from '@/store'

type AuthTab = 'signin' | 'signup'
type Busy = 'auth' | 'google' | null

export function Login() {
  const { signInWithPassword, signUp, signInWithGoogle } = useAuth()
  const toast = useStore((s) => s.toast)

  const [tab, setTab] = useState<AuthTab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [info, setInfo] = useState<string | null>(null)

  const switchTab = (next: AuthTab) => {
    setTab(next)
    setInfo(null)
    setPassword('')
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setInfo(null)

    const trimmed = email.trim()
    if (!trimmed) {
      toast('Introduce un email válido.', 'error')
      return
    }
    if (!password) {
      toast('Introduce tu contraseña.', 'error')
      return
    }
    if (tab === 'signup') {
      const weak = validatePassword(password)
      if (weak) {
        toast(weak, 'error')
        return
      }
    }

    setBusy('auth')
    const result =
      tab === 'signin'
        ? await signInWithPassword(trimmed, password)
        : await signUp(trimmed, password)
    setBusy(null)

    if (result.error) {
      toast(result.error, 'error')
      return
    }

    if (tab === 'signup') {
      setInfo(
        'Cuenta creada. Si tu proyecto pide confirmación, revisa tu email; si no, ya puedes usar el journal.',
      )
      toast('Cuenta creada correctamente.', 'success')
    }
  }

  const onGoogle = async () => {
    setInfo(null)
    setBusy('google')
    const { error } = await signInWithGoogle()
    if (error) {
      setBusy(null)
      toast(error, 'error')
    }
    // OAuth redirige; no resetear busy si va bien
  }

  return (
    <div className="h-full relative flex items-center justify-center bg-bg overflow-hidden p-6">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(700px 380px at 50% 20%, rgba(74,222,128,0.1), transparent 55%), radial-gradient(500px 300px at 80% 80%, rgba(56,189,248,0.05), transparent 50%)',
        }}
      />
      <div className="drag-region absolute inset-x-0 top-0 h-12 z-30" />

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="flex justify-center mb-8">
          <BrandLockup mark={48} />
        </div>

        <div className="card p-8">
          <div
            role="tablist"
            aria-label="Autenticación"
            className="flex p-1 rounded-xl bg-surface-3 border border-border-2"
          >
            <TabButton active={tab === 'signin'} onClick={() => switchTab('signin')}>
              Iniciar Sesión
            </TabButton>
            <TabButton active={tab === 'signup'} onClick={() => switchTab('signup')}>
              Crear Cuenta
            </TabButton>
          </div>

          <h1 className="text-xl font-semibold tracking-tight mt-6">
            {tab === 'signin' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
          </h1>
          <p className="text-sm text-muted mt-2 leading-relaxed">
            {tab === 'signin'
              ? 'Accede a tu Trading Journal. Sin cuenta no hay acceso a la interfaz.'
              : 'Regístrate para guardar y sincronizar tus operaciones en la nube.'}
          </p>

          <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
            <Field label="Email">
              <div className="relative">
                <Mail
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none"
                />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-surface-3 border border-border-2 text-sm text-text placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  disabled={busy !== null}
                />
              </div>
            </Field>

            <Field label="Contraseña">
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none"
                />
                <input
                  type="password"
                  autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === 'signup' ? 'Mín. 8 caracteres, letras y números' : '••••••••'}
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-surface-3 border border-border-2 text-sm text-text placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  disabled={busy !== null}
                />
              </div>
            </Field>

            <Button type="submit" variant="primary" className="w-full h-11" disabled={busy !== null}>
              {busy === 'auth' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : tab === 'signin' ? (
                'Entrar'
              ) : (
                'Crear cuenta'
              )}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
              <span className="bg-surface-2 px-3 text-dim">o continúa con</span>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full h-11"
            disabled={busy !== null}
            onClick={() => void onGoogle()}
          >
            {busy === 'google' ? <Loader2 size={16} className="animate-spin" /> : <GoogleGlyph />}
            Continuar con Google
          </Button>

          {info && (
            <p className="mt-4 text-[13px] text-accent leading-relaxed">{info}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'flex-1 h-9 rounded-lg text-[13px] font-medium transition-all',
        active
          ? 'bg-surface-2 text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
          : 'text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.6 0 4.8-.9 6.4-2.3l-3.1-2.4c-.9.6-2 1-3.3 1-2.5 0-4.7-1.7-5.5-4l-3.2 2.5C5.1 20.9 8.3 23 12 23z"
      />
      <path
        fill="#4A90E2"
        d="M6.5 15.3c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8L3.3 9.2C2.5 10.8 2 12.4 2 14.1c0 1.7.5 3.3 1.3 4.7l3.2-2.5z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.7c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 2.8 14.6 2 12 2 8.3 2 5.1 4.1 3.3 7.4l3.2 2.5c.8-2.3 3-4.2 5.5-4.2z"
      />
    </svg>
  )
}
