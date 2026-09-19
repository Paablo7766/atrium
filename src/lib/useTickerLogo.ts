import { useEffect, useState } from 'react'
import { cleanTicker } from '@/lib/ticker'
import { peekTickerLogo, resolveTickerLogo } from '@/lib/tickerLogoService'

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

    const instant = peekTickerLogo(symbol)
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

    void resolveTickerLogo(symbol).then((resolved) => {
      if (cancelled) return
      setUrl(resolved)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [symbol])

  return { url, loading, symbol }
}
