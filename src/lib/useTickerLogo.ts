import { useEffect, useState } from 'react'
import { cleanTicker } from '@/lib/ticker'
import {
  peekTickerLogoState,
  resolveTickerLogo,
  type TickerLogoStatus,
} from '@/lib/tickerLogoService'
import type { TickerBadge } from '@/lib/tickerAssets'

/**
 * Resolves a logo URL for a raw broker ticker.
 * `symbol` is always cleanTicker(raw) — use that only for network/cache keys,
 * not for UI labels (pass the original ticker to AssetLogo / text).
 *
 * Equities get a public CDN URL on first paint (no API key).
 * `status === 'error'` is reserved for a hard miss; CDN fallback stays `ok`.
 */
export function useTickerLogo(rawTicker: string | undefined | null) {
  const symbol = rawTicker ? cleanTicker(rawTicker) : ''
  const peeked = symbol ? peekTickerLogoState(symbol) : null

  const [url, setUrl] = useState<string | null>(() => peeked?.url ?? null)
  const [badge, setBadge] = useState<TickerBadge | undefined>(() => peeked?.badge)
  const [loading, setLoading] = useState(() => !peeked && !!symbol)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<TickerLogoStatus | 'idle'>(() => {
    if (!symbol) return 'unavailable'
    if (peeked) return peeked.status
    return 'idle'
  })

  useEffect(() => {
    if (!symbol) {
      setUrl(null)
      setBadge(undefined)
      setLoading(false)
      setError(null)
      setStatus('unavailable')
      return
    }

    const instant = peekTickerLogoState(rawTicker!)
    setUrl(instant.url)
    setBadge(instant.badge)
    setError(instant.error ?? null)
    setStatus(instant.status)

    // Local map is final (crypto, index stand-ins, FX badges)
    if (instant.source === 'local') {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(instant.source !== 'cdn' && instant.source !== 'cache')

    void resolveTickerLogo(rawTicker!).then((resolved) => {
      if (cancelled) return
      setUrl(resolved.url)
      setBadge(resolved.badge)
      setStatus(resolved.status)
      setError(resolved.error ?? null)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [symbol, rawTicker])

  return { url, badge, loading, symbol, error, status }
}
