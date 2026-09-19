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
 * Cotizaciones en vivo para posiciones OPEN vía FMP Stock Batch Quote.
 * Una sola petición por ciclo (todos los tickers únicos) y polling cada 60s.
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

    const apiKey = import.meta.env.VITE_FMP_API_KEY?.trim()
    if (!apiKey) {
      setQuotes({})
      setIsLoadingQuotes(false)
      setError(null)
      return
    }

    let cancelled = false

    async function fetchQuotes() {
      setIsLoadingQuotes(true)
      try {
        const url =
          `https://financialmodelingprep.com/api/v3/batch-quote` +
          `?symbols=${encodeURIComponent(symbolsKey)}` +
          `&apikey=${encodeURIComponent(apiKey!)}`

        const res = await fetch(url)
        if (!res.ok) throw new Error(`FMP batch-quote ${res.status}`)

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
