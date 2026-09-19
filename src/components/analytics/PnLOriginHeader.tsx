import { clsx } from 'clsx'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Pnl, Ring } from '@/components/ui'
import { fmtMoney, fmtNum } from '@/lib/format'
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <SideCard label={longLabel} icon="long" data={long} currency={currency} />
      <SideCard label={shortLabel} icon="short" data={short} currency={currency} />
    </div>
  )
}

function SideCard({
  label,
  icon,
  data,
  currency,
}: {
  label: string
  icon: 'long' | 'short'
  data: GroupPerf
  currency: Currency
}) {
  const empty = data.count === 0
  return (
    <div className="rounded-xl bg-surface border border-border px-5 py-5 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={clsx(
              'w-8 h-8 rounded-xl flex items-center justify-center',
              icon === 'long' ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#f87171]/10 text-[#f87171]',
            )}
          >
            {icon === 'long' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          </span>
          <div>
            <div className="text-[12px] font-medium text-muted">{label}</div>
            <Pnl value={data.pnl} className="text-[22px] font-semibold tracking-tight leading-none mt-1 block">
              {empty ? '—' : fmtMoney(data.pnl, currency, { sign: true })}
            </Pnl>
          </div>
        </div>
        {!empty && (
          <Ring
            value={data.winRate}
            size={44}
            stroke={3.5}
            color={icon === 'long' ? '#4ade80' : '#f87171'}
          />
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-[12px]">
        <div>
          <div className="text-dim">Ops</div>
          <div className="num font-semibold mt-0.5">{data.count}</div>
        </div>
        <div>
          <div className="text-dim">Win %</div>
          <div className="num font-semibold mt-0.5">{empty ? '—' : `${data.winRate.toFixed(0)}%`}</div>
        </div>
        <div>
          <div className="text-dim">PF</div>
          <div className="num font-semibold mt-0.5">
            {empty ? '—' : data.profitFactor === Infinity ? '∞' : fmtNum(data.profitFactor, 2)}
          </div>
        </div>
      </div>
    </div>
  )
}
