import { useEffect, useState } from 'react'
import { cleanTicker } from '@/lib/ticker'
import {
  peekTickerLogo,
  resolveTickerLogo,
  type TickerLogoStatus,
} from '@/lib/tickerLogoService'

/**
 * Resolves a logo URL for a raw broker ticker.
 * `symbol` is always cleanTicker(raw) — use that only for network/cache keys,
 * not for UI labels (pass the original ticker to AssetLogo / text).
 *
 * `status === 'error'` means credentials/network failed — not "this ticker has no logo".
 */
export function useTickerLogo(rawTicker: string | undefined | null) {
  const symbol = rawTicker ? cleanTicker(rawTicker) : ''
  const peeked = symbol ? peekTickerLogo(symbol) : null

  const [url, setUrl] = useState<string | null>(() => (typeof peeked === 'string' ? peeked : null))
  const [loading, setLoading] = useState(() => peeked === undefined && !!symbol)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<TickerLogoStatus | 'idle'>(() => {
    if (!symbol) return 'unavailable'
    if (typeof peeked === 'string') return 'ok'
    if (peeked === null) return 'unavailable'
    return 'idle'
  })

  useEffect(() => {
    if (!symbol) {
      setUrl(null)
      setLoading(false)
      setError(null)
      setStatus('unavailable')
      return
    }

    // Pass raw through; service applies cleanTicker for cache + FMP URL
    const instant = peekTickerLogo(rawTicker!)
    if (typeof instant === 'string') {
      setUrl(instant)
      setLoading(false)
      setError(null)
      setStatus('ok')
      return
    }
    if (instant === null) {
      setUrl(null)
      setLoading(false)
      setError(null)
      setStatus('unavailable')
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setStatus('idle')

    void resolveTickerLogo(rawTicker!).then((resolved) => {
      if (cancelled) return
      setUrl(resolved.url)
      setStatus(resolved.status)
      setError(resolved.error ?? null)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [symbol, rawTicker])

  return { url, loading, symbol, error, status }
}
