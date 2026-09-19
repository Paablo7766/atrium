import { useEffect, useState } from 'react'
import { cleanTicker } from '@/lib/ticker'
import { peekTickerLogo, resolveTickerLogo } from '@/lib/tickerLogoService'

/**
 * Resolves a logo URL for a raw broker ticker.
 * `symbol` is always cleanTicker(raw) — use that only for network/cache keys,
 * not for UI labels (pass the original ticker to AssetLogo / text).
 */
export function useTickerLogo(rawTicker: string | undefined | null) {
  const symbol = rawTicker ? cleanTicker(rawTicker) : ''
  const peeked = symbol ? peekTickerLogo(symbol) : null

  const [url, setUrl] = useState<string | null>(() => (typeof peeked === 'string' ? peeked : null))
  const [loading, setLoading] = useState(() => peeked === undefined && !!symbol)

  useEffect(() => {
    if (!symbol) {
      setUrl(null)
      setLoading(false)
      return
    }

    // Pass raw through; service applies cleanTicker for cache + FMP URL
    const instant = peekTickerLogo(rawTicker!)
    if (typeof instant === 'string') {
      setUrl(instant)
      setLoading(false)
      return
    }
    if (instant === null) {
      setUrl(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    void resolveTickerLogo(rawTicker!).then((resolved) => {
      if (cancelled) return
      setUrl(resolved)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [symbol, rawTicker])

  return { url, loading, symbol }
}
