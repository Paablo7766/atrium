import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type AuthContextValue = {
  session: Session | null
  user: User | null
  isLoading: boolean
  /** false si faltan VITE_SUPABASE_* — la app sigue en modo local. */
  cloudEnabled: boolean
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const MIN_PASSWORD_LEN = 8

/** Reglas de contraseña en cliente (Supabase debe reflejar lo mismo en el dashboard). */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LEN) {
    return `La contraseña es demasiado corta. Usa al menos ${MIN_PASSWORD_LEN} caracteres.`
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La contraseña debe incluir letras y números.'
  }
  return null
}

/** Traduce mensajes habituales de Supabase Auth a español legible. */
export function mapAuthError(message: string | undefined | null): string {
  if (!message) return 'Ha ocurrido un error. Inténtalo de nuevo.'
  const m = message.toLowerCase()

  if (m.includes('password should be at least') || m.includes('password is known to be weak')) {
    return 'La contraseña es demasiado débil. Usa al menos 8 caracteres.'
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'Ya existe una cuenta con este email. Inicia sesión o usa otro email.'
  }
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Email o contraseña incorrectos.'
  }
  if (m.includes('email not confirmed')) {
    return 'Confirma tu email antes de iniciar sesión (revisa tu bandeja).'
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'Introduce un email válido.'
  }
  if (m.includes('signup is disabled')) {
    return 'El registro está deshabilitado en este momento.'
  }

  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cloudEnabled = isSupabaseConfigured()
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(cloudEnabled)

  useEffect(() => {
    if (!cloudEnabled) {
      setIsLoading(false)
      return
    }

    let mounted = true

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      if (!data.session) {
        setSession(null)
        setIsLoading(false)
        return
      }
      // Revalidar con el servidor para no confiar solo en storage local
      const { data: userData, error } = await supabase.auth.getUser()
      if (!mounted) return
      if (error || !userData.user) {
        await supabase.auth.signOut()
        setSession(null)
      } else {
        setSession(data.session)
      }
      setIsLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [cloudEnabled])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!cloudEnabled) return { error: 'Supabase no está configurado.' }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    return { error: error ? mapAuthError(error.message) : null }
  }, [cloudEnabled])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!cloudEnabled) return { error: 'Supabase no está configurado.' }
    const strength = validatePassword(password)
    if (strength) return { error: strength }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    return { error: error ? mapAuthError(error.message) : null }
  }, [cloudEnabled])

  const signInWithMagicLink = useCallback(async (email: string) => {
    if (!cloudEnabled) return { error: 'Supabase no está configurado.' }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    return { error: error ? mapAuthError(error.message) : null }
  }, [cloudEnabled])

  const signInWithGoogle = useCallback(async () => {
    if (!cloudEnabled) return { error: 'Supabase no está configurado.' }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    return { error: error ? mapAuthError(error.message) : null }
  }, [cloudEnabled])

  const signOut = useCallback(async () => {
    if (!cloudEnabled) return
    await supabase.auth.signOut()
  }, [cloudEnabled])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      cloudEnabled,
      signInWithPassword,
      signUp,
      signInWithMagicLink,
      signInWithGoogle,
      signOut,
    }),
    [
      session,
      isLoading,
      cloudEnabled,
      signInWithPassword,
      signUp,
      signInWithMagicLink,
      signInWithGoogle,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
