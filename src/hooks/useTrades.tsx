import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Trade } from '@/types'
import { useAuth } from '@/auth/AuthProvider'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fetchUserTrades } from '@/lib/tradeSync'
import { useStore } from '@/store'

export type UseTradesResult = {
  trades: Trade[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  /** true cuando hay sesión y Supabase configurado (fuente cloud activa). */
  fromCloud: boolean
}

const TradesContext = createContext<UseTradesResult | null>(null)

/**
 * Carga `trades` del usuario autenticado y los hidrata en Zustand
 * para Dashboard / Trades / Analytics.
 */
export function TradesProvider({ children }: { children: ReactNode }) {
  const { user, cloudEnabled, isLoading: authLoading } = useAuth()
  const storeTrades = useStore((s) => s.trades)
  const [cloudTrades, setCloudTrades] = useState<Trade[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fromCloud = cloudEnabled && !!user && isSupabaseConfigured()

  const applyToStore = useCallback((trades: Trade[]) => {
    useStore.setState((s) => {
      const activeId = s.settings.activeAccountId
      const accounts = s.accounts.map((a) =>
        a.id === activeId ? { ...a, trades } : a,
      )
      return { trades, accounts }
    })
  }, [])

  const refetch = useCallback(async () => {
    if (!fromCloud || !user) {
      setCloudTrades(null)
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const rows = await fetchUserTrades(user.id)
      setCloudTrades(rows)
      applyToStore(rows)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar operaciones'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [fromCloud, user, applyToStore])

  useEffect(() => {
    if (authLoading) return
    void refetch()
  }, [authLoading, refetch])

  const value = useMemo<UseTradesResult>(
    () => ({
      trades: fromCloud && cloudTrades != null ? cloudTrades : storeTrades,
      isLoading: authLoading || (fromCloud && isLoading),
      error,
      refetch,
      fromCloud,
    }),
    [fromCloud, cloudTrades, storeTrades, authLoading, isLoading, error, refetch],
  )

  return <TradesContext.Provider value={value}>{children}</TradesContext.Provider>
}

/**
 * SELECT tipado de operaciones del usuario.
 * Debe usarse dentro de `TradesProvider` (shell autenticado).
 */
export function useTrades(): UseTradesResult {
  const ctx = useContext(TradesContext)
  const storeTrades = useStore((s) => s.trades)

  if (ctx) return ctx

  // Fallback seguro fuera del provider (p.ej. tests)
  return {
    trades: storeTrades,
    isLoading: false,
    error: null,
    refetch: async () => undefined,
    fromCloud: false,
  }
}
