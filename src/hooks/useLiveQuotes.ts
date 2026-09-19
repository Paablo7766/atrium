import { useEffect, useMemo, useState } from 'react'
import type { Trade } from '@/types'
import { cleanTicker } from '@/lib/ticker'

const POLL_MS = 60_000

export type UseLiveQuotesResult = {
  /** Precio actual por ticker limpio (sin sufijos .US, etc.). */
  quotes: Record<string, number>
  isLoadingQuotes: boolean
  error: string | null
  /** Tickers únicos de posiciones OPEN, ya limpios. */
  symbols: string[]
}

/**
 * Cotizaciones en vivo para posiciones OPEN vía proxy `/api/quotes` (FMP batch-quote).
 * La API key nunca sale del servidor / middleware de Vite.
 */
export function useLiveQuotes(trades: Trade[]): UseLiveQuotesResult {
  const symbols = useMemo(() => {
    const set = new Set<string>()
    for (const t of trades) {
      if (t.status !== 'OPEN') continue
      const s = cleanTicker(t.symbol)
      if (s) set.add(s)
    }
    return [...set].sort()
  }, [trades])

  const symbolsKey = symbols.join(',')

  const [quotes, setQuotes] = useState<Record<string, number>>({})
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!symbolsKey) {
      setQuotes({})
      setIsLoadingQuotes(false)
      setError(null)
      return
    }

    let cancelled = false

    async function fetchQuotes() {
      setIsLoadingQuotes(true)
      try {
        const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbolsKey)}`)

        // Sin clave en servidor / Electron sin proxy → degradar en silencio
        if (res.status === 503) {
          if (!cancelled) {
            setQuotes({})
            setError(null)
          }
          return
        }

        if (!res.ok) throw new Error(`Quotes proxy ${res.status}`)

        const data: unknown = await res.json()
        if (cancelled) return

        const next: Record<string, number> = {}
        if (Array.isArray(data)) {
          for (const row of data) {
            if (!row || typeof row !== 'object') continue
            const rec = row as Record<string, unknown>
            const sym = typeof rec.symbol === 'string' ? cleanTicker(rec.symbol) : ''
            const price = Number(rec.price)
            if (sym && Number.isFinite(price)) next[sym] = price
          }
        }

        setQuotes(next)
        setError(null)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No se pudieron cargar las cotizaciones')
        }
      } finally {
        if (!cancelled) setIsLoadingQuotes(false)
      }
    }

    void fetchQuotes()
    const id = window.setInterval(() => void fetchQuotes(), POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [symbolsKey])

  return { quotes, isLoadingQuotes, error, symbols }
}
