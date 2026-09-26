import { clsx } from 'clsx'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Pnl, Ring } from '@/components/ui'
import { Detail, MagnitudeBar } from '@/components/analytics/primitives'
import { fmtMoney, fmtNum } from '@/lib/format'
import { useT } from '@/lib/useI18n'
import type { GroupPerf } from '@/lib/stats'
import type { Currency } from '@/types'

export function PnLOriginHeader({
  long,
  short,
  currency,
  longLabel,
  shortLabel,
}: {
  long: GroupPerf
  short: GroupPerf
  currency: Currency
  longLabel: string
  shortLabel: string
}) {
  if (long.count === 0 && short.count === 0) return null
  const max = Math.max(Math.abs(long.pnl), Math.abs(short.pnl), 1)
  const total = long.count + short.count

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
      <SideCard label={longLabel} icon="long" data={long} currency={currency} max={max} total={total} />
      <SideCard label={shortLabel} icon="short" data={short} currency={currency} max={max} total={total} />
    </div>
  )
}

function SideCard({
  label,
  icon,
  data,
  currency,
  max,
  total,
}: {
  label: string
  icon: 'long' | 'short'
  data: GroupPerf
  currency: Currency
  max: number
  total: number
}) {
  const t = useT()
  const empty = data.count === 0
  const share = total ? (data.count / total) * 100 : 0
  return (
    <section className="card card-hover min-w-0 p-5 lg:p-6 animate-section-rise">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                icon === 'long' ? 'bg-accent/10 text-accent' : 'bg-loss/10 text-loss',
              )}
            >
              {icon === 'long' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
            {!empty && <span className="num text-[11px] text-dim">· {fmtNum(share, 0)}%</span>}
          </div>
          <Pnl value={data.pnl} className="mt-3 block truncate text-[24px] font-semibold leading-none tracking-[-0.03em]">
            {empty ? '—' : fmtMoney(data.pnl, currency, { sign: true })}
          </Pnl>
        </div>
        {!empty && (
          <Ring value={data.winRate} size={44} stroke={3.5} track="rgba(255,255,255,0.06)">
            <span className="num text-[11px] font-semibold text-text-2">{fmtNum(data.winRate, 0)}%</span>
          </Ring>
        )}
      </div>

      <MagnitudeBar className="mt-4" pct={empty ? 0 : (Math.abs(data.pnl) / max) * 100} positive={data.pnl >= 0} />

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-3.5">
        <Detail label={t('an.col.ops')} value={data.count} />
        <Detail label={t('an.col.pf')} value={empty ? '—' : data.profitFactor === Infinity ? '∞' : fmtNum(data.profitFactor, 2)} />
        <Detail
          label={t('an.col.avg')}
          value={empty ? '—' : fmtMoney(data.avgPnl, currency, { sign: true })}
          tone={empty || data.avgPnl === 0 ? undefined : data.avgPnl > 0 ? 'green' : 'red'}
        />
      </div>
    </section>
  )
}
