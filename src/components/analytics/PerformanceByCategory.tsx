import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Empty, Pnl, Segmented } from '@/components/ui'
import { DualProgressBar } from '@/components/analytics/DualProgressBar'
import { AnalyticsCard } from '@/components/analytics/primitives'
import { fmtMoney, fmtNum, fmtR } from '@/lib/format'
import { displayGroupKey, getAppLocale } from '@/lib/i18n'
import { useT } from '@/lib/useI18n'
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
  const t = useT()
  const sorted = sortGroups(groups, sort)
  const groupLabel = groupOptions.find((o) => o.value === groupBy)?.label ?? ''

  return (
    <AnalyticsCard
      title={title}
      subtitle={subtitle}
      action={<Segmented size="sm" value={groupBy} onChange={onGroupByChange} options={groupOptions} />}
    >
      {sorted.length ? (
        <div className="-mx-5 max-h-[400px] overflow-y-auto overflow-x-hidden px-5 lg:-mx-6 lg:px-6">
          <table className="w-full table-fixed text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="text-[10px] uppercase tracking-[0.14em] text-dim">
                <th className="truncate py-2.5 pr-3 text-left font-semibold">{groupLabel}</th>
                <th className="hidden w-[24%] py-2.5 pr-6 text-left font-semibold md:table-cell">{t('an.col.gp')}</th>
                <SortHead k="count" sort={sort} onSort={onSort} className="hidden w-16 sm:table-cell">
                  {t('an.col.ops')}
                </SortHead>
                <SortHead k="winRate" sort={sort} onSort={onSort} className="w-[4.25rem] sm:w-20">
                  {t('an.col.win')}
                </SortHead>
                <SortHead k="profitFactor" sort={sort} onSort={onSort} className="hidden w-16 sm:table-cell">
                  {t('an.col.pf')}
                </SortHead>
                <SortHead k="avgR" sort={sort} onSort={onSort} className="hidden w-20 lg:table-cell">
                  {t('an.avgR')}
                </SortHead>
                <SortHead k="pnl" sort={sort} onSort={onSort} className="w-[6.5rem] sm:w-28">
                  P&L
                </SortHead>
              </tr>
            </thead>
            <tbody>
              {sorted.map((g) => (
                <tr key={g.key} className="border-t border-white/[0.05] transition-colors hover:bg-white/[0.02]">
                  <td className="truncate py-2.5 pr-3 font-medium" title={displayGroupKey(getAppLocale(), g.key)}>
                    {displayGroupKey(getAppLocale(), g.key)}
                  </td>
                  <td className="hidden py-2.5 pr-6 md:table-cell">
                    <div className="flex items-center gap-3">
                      <DualProgressBar className="flex-1" grossProfit={g.grossProfit} grossLoss={g.grossLoss} />
                      <span className="num shrink-0 text-[11px] text-muted">
                        {g.wins}
                        <span className="text-dim">/</span>
                        {g.losses}
                      </span>
                    </div>
                  </td>
                  <td className="num hidden py-2.5 text-right text-muted sm:table-cell">{g.count}</td>
                  <td className="num py-2.5 text-right text-text-2">{g.winRate.toFixed(0)}%</td>
                  <td className="num hidden py-2.5 text-right text-muted sm:table-cell">
                    {g.profitFactor === Infinity ? '∞' : fmtNum(g.profitFactor, 2)}
                  </td>
                  <td
                    className={clsx(
                      'num hidden py-2.5 text-right lg:table-cell',
                      g.avgR === null ? 'text-dim' : g.avgR >= 0 ? 'text-accent' : 'text-loss',
                    )}
                  >
                    {fmtR(g.avgR)}
                  </td>
                  <td className="truncate py-2.5 text-right">
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
        <Empty title={t('an.noPeriod')} />
      )}
    </AnalyticsCard>
  )
}

function SortHead({
  k,
  children,
  sort,
  onSort,
  className,
}: {
  k: CategorySortKey
  children: ReactNode
  sort: { key: CategorySortKey; dir: 1 | -1 }
  onSort: (next: { key: CategorySortKey; dir: 1 | -1 }) => void
  className?: string
}) {
  const active = sort.key === k
  const toggle = () => onSort({ key: k, dir: active ? (sort.dir === -1 ? 1 : -1) : -1 })
  return (
    <th className={clsx('py-2.5 text-right font-semibold', className)} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={toggle}
        className={clsx(
          'inline-flex items-center gap-1 rounded-md uppercase tracking-[0.14em] transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25',
          active ? 'text-text-2' : 'text-dim',
        )}
      >
        {children}
        <ChevronDown
          size={11}
          className={clsx('transition-transform', active ? (sort.dir === 1 ? 'rotate-180 opacity-100' : 'opacity-100') : 'opacity-30')}
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
