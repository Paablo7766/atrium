import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { tickerInitials } from '@/lib/ticker'
import { canTrimLogoUrl, CIRCLE_SAFE_RATIO, trimLogoFromImage } from '@/lib/trimLogo'
import { useTickerLogo } from '@/lib/useTickerLogo'

type Size = 'xs' | 'sm' | 'md' | 'lg'

const SIZES: Record<Size, { box: number; text: number }> = {
  xs: { box: 18, text: 8 },
  sm: { box: 22, text: 9 },
  md: { box: 28, text: 11 },
  lg: { box: 36, text: 13 },
}

function parqetUrl(symbol: string): string {
  return `https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}`
}

function fallbackSymbol(src: string, symbol: string): string {
  const m = src.match(/image-stock\/([A-Z0-9]+)\.png/i)
  return m?.[1] ?? symbol
}

export function AssetLogo({
  ticker,
  size = 'sm',
  className,
}: {
  ticker: string
  size?: Size
  className?: string
}) {
  const { url, badge, symbol, error, status } = useTickerLogo(ticker)
  const [src, setSrc] = useState<string | null>(url)
  const [fitted, setFitted] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)
  const [frameReady, setFrameReady] = useState(() => !url || !canTrimLogoUrl(url))
  const dim = SIZES[size]
  const initials = tickerInitials(symbol || ticker)
  const displaySrc = fitted ?? src
  const hasImg = !!displaySrc && !broken
  const showBadge = !hasImg && !!badge
  const badgeLabel = badge?.label ?? ''
  const badgeText = badgeLabel.length >= 2 ? Math.max(7, dim.text - 2) : dim.text
  const safePx = Math.round(dim.box * CIRCLE_SAFE_RATIO)

  useEffect(() => {
    setSrc(url)
    setFitted(null)
    setBroken(false)
    setFrameReady(!url || !canTrimLogoUrl(url))
  }, [url, symbol])

  return (
    <span
      className={clsx(
        'relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden',
        'font-semibold select-none',
        'ring-1 ring-inset ring-white/10',
        hasImg ? 'bg-white' : !showBadge && 'bg-[#3a3a44]',
        className,
      )}
      style={{
        width: dim.box,
        height: dim.box,
        fontSize: showBadge ? badgeText : dim.text,
        backgroundColor: showBadge ? badge.bg : undefined,
        color: showBadge ? (badge.fg ?? '#ffffff') : '#ffffff',
      }}
      title={error ? `${ticker} — ${error}` : ticker}
      data-logo-status={status}
      aria-hidden
    >
      <span
        className={clsx(
          'leading-none tracking-tight text-center',
          hasImg && 'invisible',
          showBadge && badgeLabel.length >= 2 && '-tracking-[0.04em]',
        )}
      >
        {showBadge ? badgeLabel : initials}
      </span>
      {hasImg && (
        <img
          src={displaySrc}
          alt=""
          crossOrigin={src && canTrimLogoUrl(src) && !fitted ? 'anonymous' : undefined}
          className={clsx(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'object-contain object-center',
            !frameReady && 'opacity-0',
          )}
          style={{ width: safePx, height: safePx }}
          onLoad={(e) => {
            if (!fitted && src && canTrimLogoUrl(src)) {
              const trimmed = trimLogoFromImage(e.currentTarget, src)
              if (trimmed) setFitted(trimmed)
            }
            setFrameReady(true)
          }}
          onError={() => {
            if (fitted) {
              setFitted(null)
              setBroken(true)
              return
            }
            if (src && symbol && !src.includes('parqet.com')) {
              setSrc(parqetUrl(fallbackSymbol(src, symbol)))
              return
            }
            setBroken(true)
          }}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      )}
    </span>
  )
}
