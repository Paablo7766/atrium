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
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

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

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setIsLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [cloudEnabled])

  const signInWithMagicLink = useCallback(async (email: string) => {
    if (!cloudEnabled) return { error: 'Supabase no está configurado.' }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    return { error: error?.message ?? null }
  }, [cloudEnabled])

  const signInWithGoogle = useCallback(async () => {
    if (!cloudEnabled) return { error: 'Supabase no está configurado.' }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    return { error: error?.message ?? null }
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
      signInWithMagicLink,
      signInWithGoogle,
      signOut,
    }),
    [session, isLoading, cloudEnabled, signInWithMagicLink, signInWithGoogle, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
