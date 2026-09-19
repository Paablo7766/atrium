import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, Empty, Pnl, Segmented } from '@/components/ui'
import { DualProgressBar } from '@/components/analytics/DualProgressBar'
import { fmtMoney, fmtNum, fmtR } from '@/lib/format'
import { displayGroupKey, getAppLocale } from '@/lib/i18n'
import type { GroupPerf } from '@/lib/stats'
import type { Currency } from '@/types'

export type CategorySortKey = 'pnl' | 'count' | 'winRate' | 'profitFactor' | 'avgR'
export type CategoryGroupBy = 'strategy' | 'symbol' | 'market' | 'tag' | 'setup'

export function PerformanceByCategory({
  groups,
  currency,
  groupBy,
  onGroupByChange,
  groupOptions,
  sort,
  onSort,
  title,
  subtitle,
}: {
  groups: GroupPerf[]
  currency: Currency
  groupBy: CategoryGroupBy
  onGroupByChange: (v: CategoryGroupBy) => void
  groupOptions: { value: CategoryGroupBy; label: string }[]
  sort: { key: CategorySortKey; dir: 1 | -1 }
  onSort: (next: { key: CategorySortKey; dir: 1 | -1 }) => void
  title: string
  subtitle: string
}) {
  const sorted = sortGroups(groups, sort)

  return (
    <Card
      title={title}
      subtitle={subtitle}
      action={<Segmented size="sm" value={groupBy} onChange={onGroupByChange} options={groupOptions} />}
    >
      {sorted.length ? (
        <div className="overflow-auto max-h-[380px] -mr-2 pr-2">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="text-[11px] uppercase tracking-wider text-dim">
                <th className="text-left font-medium py-2 min-w-[9rem]">Estrategia</th>
                <th className="text-left font-medium py-2 w-[28%] min-w-[7rem]">G / P</th>
                <SortHead k="count" sort={sort} onSort={onSort} right>
                  Ops
                </SortHead>
                <SortHead k="winRate" sort={sort} onSort={onSort} right>
                  Win %
                </SortHead>
                <SortHead k="profitFactor" sort={sort} onSort={onSort} right>
                  PF
                </SortHead>
                <SortHead k="avgR" sort={sort} onSort={onSort} right>
                  R medio
                </SortHead>
                <SortHead k="pnl" sort={sort} onSort={onSort} right>
                  P&L
                </SortHead>
              </tr>
            </thead>
            <tbody>
              {sorted.map((g) => (
                <tr key={g.key} className="border-t border-border hover:bg-surface-2/60 transition-colors">
                  <td className="py-3 font-medium truncate max-w-[11rem]">
                    {displayGroupKey(getAppLocale(), g.key)}
                  </td>
                  <td className="py-3 pr-4">
                    <DualProgressBar grossProfit={g.grossProfit} grossLoss={g.grossLoss} />
                    <div className="num text-[10px] text-dim mt-1 flex justify-between gap-2">
                      <span className="text-[#4ade80]">{g.wins}W</span>
                      <span className="text-[#f87171]">{g.losses}L</span>
                    </div>
                  </td>
                  <td className="py-3 text-right num text-muted">{g.count}</td>
                  <td className="py-3 text-right num">
                    <span className={clsx(g.winRate >= 50 ? 'text-[#4ade80]' : 'text-muted')}>
                      {g.winRate.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-3 text-right num text-muted">
                    {g.profitFactor === Infinity ? '∞' : fmtNum(g.profitFactor, 2)}
                  </td>
                  <td
                    className={clsx(
                      'py-3 text-right num',
                      g.avgR === null ? 'text-dim' : g.avgR >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]',
                    )}
                  >
                    {fmtR(g.avgR)}
                  </td>
                  <td className="py-3 text-right">
                    <Pnl value={g.pnl} className="font-semibold">
                      {fmtMoney(g.pnl, currency, { sign: true })}
                    </Pnl>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Sin datos en el periodo" />
      )}
    </Card>
  )
}

function SortHead({
  k,
  children,
  right,
  sort,
  onSort,
}: {
  k: CategorySortKey
  children: ReactNode
  right?: boolean
  sort: { key: CategorySortKey; dir: 1 | -1 }
  onSort: (next: { key: CategorySortKey; dir: 1 | -1 }) => void
}) {
  const toggle = () => onSort({ key: k, dir: sort.key === k ? (sort.dir === -1 ? 1 : -1) : -1 })
  return (
    <th className={clsx('font-medium py-2', right ? 'text-right' : 'text-left')}>
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 hover:text-text transition-colors"
      >
        {children}
        <ChevronDown
          size={11}
          className={clsx(
            'transition-transform',
            sort.key === k ? (sort.dir === 1 ? 'rotate-180 opacity-100' : 'opacity-100') : 'opacity-30',
          )}
        />
      </button>
    </th>
  )
}

export function sortGroups(groups: GroupPerf[], sort: { key: CategorySortKey; dir: 1 | -1 }) {
  const dir = sort.dir
  return [...groups].sort((a, b) => {
    const av = sortValue(a, sort.key)
    const bv = sortValue(b, sort.key)
    if (av === bv) return b.pnl - a.pnl
    return av > bv ? dir : -dir
  })
}

function sortValue(g: GroupPerf, key: CategorySortKey) {
  if (key === 'avgR') return g.avgR ?? -Infinity
  if (key === 'profitFactor') return g.profitFactor === Infinity ? Number.MAX_SAFE_INTEGER : g.profitFactor
  return g[key]
}
