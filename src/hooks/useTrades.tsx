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
import { readCloudSyncPref } from '@/lib/cloudSyncPref'
import { isSupabaseConfigured } from '@/lib/supabase'
import { isCloudSyncActive, syncJournalWithCloud, computeJournalMutationAt, bumpLocalMutationClock } from '@/lib/tradeSync'
import { useStore, flushPersist } from '@/store'
import type { PersistedData } from '@/types'

export type UseTradesResult = {
  trades: Trade[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  /** true cuando sync E2E multi-dispositivo está activo. */
  fromCloud: boolean
}

const TradesContext = createContext<UseTradesResult | null>(null)

function journalPayload(): PersistedData {
  const s = useStore.getState()
  return {
    version: 2,
    settings: s.settings,
    accounts: s.accounts,
    trades: [],
    notes: [],
  }
}

/**
 * Gestiona sync cifrado con Supabase cuando el usuario lo activa.
 * La fuente de verdad sigue siendo la BD local; el cloud es réplica E2E opcional.
 */
export function TradesProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const storeTrades = useStore((s) => s.trades)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fromCloud = isCloudSyncActive() && !!user

  const refetch = useCallback(async () => {
    if (!fromCloud) {
      setIsLoading(false)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      flushPersist()
      const payload = journalPayload()
      const localAt = computeJournalMutationAt(payload)
      bumpLocalMutationClock(localAt)
      const result = await syncJournalWithCloud(payload, localAt)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.applied === 'cloud') {
        useStore.setState((s) => {
          const activeId = result.data.settings.activeAccountId
          const accounts = result.data.accounts ?? s.accounts
          const active = accounts.find((a) => a.id === activeId) ?? accounts[0]
          return {
            settings: {
              ...result.data.settings,
              lastCloudSyncAt: new Date(result.at).toISOString(),
            },
            accounts,
            trades: active?.trades ?? [],
            notes: active?.notes ?? [],
            cashflows: active?.cashflows ?? [],
          }
        })
      } else if (result.applied === 'local') {
        useStore.setState((s) => ({
          settings: { ...s.settings, lastCloudSyncAt: new Date(result.at).toISOString() },
        }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al sincronizar')
    } finally {
      setIsLoading(false)
    }
  }, [fromCloud])

  useEffect(() => {
    if (authLoading) return
    if (!fromCloud) return
    void refetch()
  }, [authLoading, fromCloud, refetch, user?.id])

  const value = useMemo<UseTradesResult>(
    () => ({
      trades: storeTrades,
      isLoading: authLoading || (fromCloud && isLoading),
      error,
      refetch,
      fromCloud,
    }),
    [fromCloud, storeTrades, authLoading, isLoading, error, refetch],
  )

  return <TradesContext.Provider value={value}>{children}</TradesContext.Provider>
}

export function useTrades(): UseTradesResult {
  const ctx = useContext(TradesContext)
  const storeTrades = useStore((s) => s.trades)

  if (ctx) return ctx

  return {
    trades: storeTrades,
    isLoading: false,
    error: null,
    refetch: async () => undefined,
    fromCloud: isSupabaseConfigured() && readCloudSyncPref(),
  }
}
