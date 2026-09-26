import { clsx } from 'clsx'
import { getAppLocale, t } from '@/lib/i18n'

/** Barra dual verde/roja: proporción de ganancias brutas vs pérdidas brutas. */
export function DualProgressBar({
  grossProfit,
  grossLoss,
  className,
}: {
  grossProfit: number
  grossLoss: number
  className?: string
}) {
  const total = grossProfit + grossLoss
  const winPct = total > 0 ? (grossProfit / total) * 100 : 50
  const lossPct = total > 0 ? 100 - winPct : 50

  return (
    <div
      className={clsx('flex h-[5px] gap-px overflow-hidden rounded-full bg-white/[0.05]', className)}
      title={t(getAppLocale(), 'an.grossSplit', { w: winPct.toFixed(0), l: lossPct.toFixed(0) })}
    >
      <div
        className="h-full rounded-l-full bg-accent transition-all duration-700"
        style={{ width: `${winPct}%`, opacity: grossProfit > 0 ? 0.85 : 0.2 }}
      />
      <div
        className="h-full rounded-r-full bg-loss transition-all duration-700"
        style={{ width: `${lossPct}%`, opacity: grossLoss > 0 ? 0.8 : 0.2 }}
      />
    </div>
  )
}
