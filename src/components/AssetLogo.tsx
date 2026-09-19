import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { tickerInitials } from '@/lib/ticker'
import { useTickerLogo } from '@/lib/useTickerLogo'

type Size = 'xs' | 'sm' | 'md' | 'lg'

const SIZES: Record<Size, { box: number; text: number }> = {
  xs: { box: 18, text: 8 },
  sm: { box: 22, text: 9 },
  md: { box: 28, text: 11 },
  lg: { box: 36, text: 13 },
}

export function AssetLogo({
  ticker,
  size = 'sm',
  className,
}: {
  /** Raw broker ticker (e.g. AAPL.US). Shown in UI; network lookup uses cleanTicker(). */
  ticker: string
  size?: Size
  className?: string
}) {
  // Hook cleans for FMP / cache; UI keeps the original `ticker` string.
  const { url, symbol } = useTickerLogo(ticker)
  const [broken, setBroken] = useState(false)
  const dim = SIZES[size]
  const initials = tickerInitials(symbol || ticker)
  const showImg = !!url && !broken

  useEffect(() => {
    setBroken(false)
  }, [url, symbol])

  return (
    <span
      className={clsx(
        'relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden',
        'bg-[#3a3a44] text-white font-semibold select-none',
        'ring-1 ring-inset ring-white/10',
        className,
      )}
      style={{ width: dim.box, height: dim.box, fontSize: dim.text }}
      title={ticker}
      aria-hidden
    >
      <span className={clsx('leading-none tracking-tight', showImg && 'invisible')}>{initials}</span>
      {showImg && (
        <img
          src={url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover bg-white"
          onError={() => setBroken(true)}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      )}
    </span>
  )
}
