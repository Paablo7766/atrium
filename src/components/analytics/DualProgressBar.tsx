import { clsx } from 'clsx'

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
      className={clsx('h-1.5 rounded-full overflow-hidden flex bg-[#1a1a1e]', className)}
      title={`Ganancias ${winPct.toFixed(0)}% · Pérdidas ${lossPct.toFixed(0)}%`}
    >
      <div
        className="h-full bg-[#4ade80] transition-all duration-700"
        style={{ width: `${winPct}%`, opacity: grossProfit > 0 ? 0.9 : 0.25 }}
      />
      <div
        className="h-full bg-[#f87171] transition-all duration-700"
        style={{ width: `${lossPct}%`, opacity: grossLoss > 0 ? 0.85 : 0.25 }}
      />
    </div>
  )
}
