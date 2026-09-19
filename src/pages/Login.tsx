import { useState, type FormEvent } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { BrandLockup } from '@/components/BrandMark'
import { Button, Field } from '@/components/ui'
import { useAuth } from '@/auth/AuthProvider'

export function Login() {
  const { signInWithMagicLink, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'magic' | 'google' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onMagicLink = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!email.trim()) {
      setError('Introduce un email válido.')
      return
    }
    setBusy('magic')
    const { error: err } = await signInWithMagicLink(email)
    setBusy(null)
    if (err) {
      setError(err)
      return
    }
    setMessage('Revisa tu bandeja: te hemos enviado un enlace mágico.')
  }

  const onGoogle = async () => {
    setError(null)
    setMessage(null)
    setBusy('google')
    const { error: err } = await signInWithGoogle()
    if (err) {
      setBusy(null)
      setError(err)
    }
    // OAuth redirige; no resetear busy si va bien
  }

  return (
    <div className="h-full relative flex items-center justify-center bg-bg overflow-hidden p-6">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(700px 380px at 50% 20%, rgba(92,227,146,0.1), transparent 55%), radial-gradient(500px 300px at 80% 80%, rgba(92,227,146,0.04), transparent 50%)',
        }}
      />
      <div className="drag-region absolute inset-x-0 top-0 h-12 z-30" />

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="flex justify-center mb-8">
          <BrandLockup mark={48} />
        </div>

        <div className="card p-8">
          <h1 className="text-xl font-semibold tracking-tight">Iniciar sesión</h1>
          <p className="text-sm text-muted mt-2 leading-relaxed">
            Accede a tu diario en la nube. Tus operaciones quedan vinculadas a tu cuenta.
          </p>

          <form onSubmit={(e) => void onMagicLink(e)} className="mt-6 space-y-4">
            <Field label="Email">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full h-11 px-3.5 rounded-xl bg-surface-3 border border-border-2 text-sm text-text placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                disabled={busy !== null}
              />
            </Field>

            <Button type="submit" variant="primary" className="w-full h-11" disabled={busy !== null}>
              {busy === 'magic' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Mail size={16} />
              )}
              Enviar Magic Link
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
            {busy === 'google' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <GoogleGlyph />
            )}
            Google
          </Button>

          {message && (
            <p className="mt-4 text-[13px] text-accent leading-relaxed">{message}</p>
          )}
          {error && (
            <p className="mt-4 text-[13px] text-loss leading-relaxed">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        opacity=".9"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        opacity=".75"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        opacity=".85"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        opacity=".7"
      />
    </svg>
  )
}
