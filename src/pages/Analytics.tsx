import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { BarChart3 } from 'lucide-react'
import { useStore } from '@/store'
import { Topbar } from '@/components/Topbar'
import { Card, Empty, Pnl, Ring, Segmented, Stars, Trend } from '@/components/ui'
import { CategoryBars, DrawdownChart } from '@/components/charts'
import {
  AnalyticsLayout,
  PerformanceByCategory,
  PnLOriginHeader,
  RDistribution,
  type CategoryGroupBy,
  type CategorySortKey,
} from '@/components/analytics'
import {
  closedTrades,
  computeStats,
  emptyGroupPerf,
  equityCurve,
  groupPerformance,
  tradeDurationMs,
  tradePnl,
  type GroupPerf,
} from '@/lib/stats'
import { fmtDuration, fmtMoney, fmtNum, fmtPayoff, fmtPct, fmtR, fmtStreak, toMonthKey } from '@/lib/format'
import { deltaPct, equityBefore, filterByPreviousRange, filterByRange, filterCashflowsByPreviousRange, filterCashflowsByRange, priorEquity, previousRangeStart } from '@/lib/range'
import type { Currency, Trade } from '@/types'
import { useT, useLocale } from '@/lib/useI18n'
import { displayGroupKey, emotionLabel, getAppLocale, rangeHint, rangeOptions, t as tx, weekdayShort } from '@/lib/i18n'

type GroupBy = CategoryGroupBy
type TimeView = 'hour' | 'month'
type SortKey = CategorySortKey

export function Analytics() {
  const trades = useStore((s) => s.trades)
  const settings = useStore((s) => s.settings)
  const cashflows = useStore((s) => s.cashflows)
  const range = useStore((s) => s.statsRange)
  const setRange = useStore((s) => s.setStatsRange)
  const [groupBy, setGroupBy] = useState<GroupBy>('strategy')
  const [timeView, setTimeView] = useState<TimeView>('hour')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'pnl', dir: -1 })
  const t = useT()
  const locale = useLocale()

  const filtered = useMemo(() => closedTrades(filterByRange(trades, range)), [trades, range])
  const previous = useMemo(() => closedTrades(filterByPreviousRange(trades, range)), [trades, range])
  const rangeFlows = useMemo(() => filterCashflowsByRange(cashflows, range), [cashflows, range])
  const previousFlows = useMemo(() => filterCashflowsByPreviousRange(cashflows, range), [cashflows, range])
  const baseEquity = useMemo(
    () => priorEquity(trades, range, settings.startingBalance, cashflows),
    [trades, range, settings.startingBalance, cashflows],
  )
  const prevBase = useMemo(
    () => equityBefore(trades, previousRangeStart(range), settings.startingBalance, cashflows),
    [trades, range, settings.startingBalance, cashflows],
  )
  const stats = useMemo(() => computeStats(filtered, baseEquity, rangeFlows), [filtered, baseEquity, rangeFlows])
  const prevStats = useMemo(() => computeStats(previous, prevBase, previousFlows), [previous, prevBase, previousFlows])
  const curve = useMemo(() => equityCurve(filtered, baseEquity, rangeFlows), [filtered, baseEquity, rangeFlows])
  const playbook = settings.playbook
  const heroPnl = useCountUp(stats.netPnl)

  const byWeekday = useMemo(() => {
    const g = groupPerformance(filtered, (t) => String(new Date(t.exitDate ?? t.entryDate).getDay()))
    const order = settings.weekStartsOn === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]
    return order.map((d) => g.find((x) => x.key === String(d)) ?? emptyGroupPerf(String(d)))
  }, [filtered, settings.weekStartsOn])

  const byHour = useMemo(() => {
    const g = groupPerformance(filtered, (t) => String(new Date(t.entryDate).getHours()))
    const hours = [...new Set(filtered.map((t) => new Date(t.entryDate).getHours()))].sort((a, b) => a - b)
    return hours.map((h) => g.find((x) => x.key === String(h)) ?? emptyGroupPerf(String(h)))
  }, [filtered])

  const byMonth = useMemo(() => {
    const g = groupPerformance(filtered, (t) => toMonthKey(t.exitDate ?? t.entryDate))
    return g.sort((a, b) => a.key.localeCompare(b.key))
  }, [filtered])

  const hasSetup = filtered.some((t) => t.setupId) || playbook.length > 0

  useEffect(() => {
    if (groupBy === 'setup' && !hasSetup) setGroupBy('strategy')
  }, [groupBy, hasSetup])

  const strategyPerf = useMemo(
    () => groupPerformance(filtered, (t) => t.strategy || 'Sin estrategia'),
    [filtered],
  )

  const groups = useMemo(() => {
    const keyFn: Record<GroupBy, (t: Trade) => string | undefined> = {
      strategy: (t) => t.strategy || 'Sin estrategia',
      symbol: (t) => t.symbol,
      market: (t) => t.market,
      tag: (t) => (t.tags.length ? t.tags[0] : 'Sin etiqueta'),
      setup: (t) => playbook.find((s) => s.id === t.setupId)?.name ?? 'Sin setup',
    }
    if (groupBy === 'tag') {
      const expanded: Trade[] = []
      for (const t of filtered) {
        if (!t.tags.length) expanded.push({ ...t, tags: ['Sin etiqueta'] })
        else for (const tag of t.tags) expanded.push({ ...t, tags: [tag] })
      }
      return groupPerformance(expanded, (t) => t.tags[0])
    }
    return groupPerformance(filtered, keyFn[groupBy])
  }, [filtered, groupBy, playbook])

  const sides = useMemo(() => {
    const g = groupPerformance(filtered, (t) => t.direction)
    return {
      long: g.find((x) => x.key === 'LONG') ?? emptyGroupPerf('LONG'),
      short: g.find((x) => x.key === 'SHORT') ?? emptyGroupPerf('SHORT'),
    }
  }, [filtered])

  const byEmotion = useMemo(() => groupPerformance(filtered, (t) => t.emotion ?? 'Sin indicar'), [filtered])
  const byRating = useMemo(
    () => groupPerformance(filtered.filter((t) => t.rating > 0), (t) => String(t.rating)),
    [filtered],
  )
  const byMistake = useMemo(() => {
    const expanded: Trade[] = []
    for (const t of filtered) {
      const ms = t.mistakes?.filter(Boolean) ?? []
      if (!ms.length) continue
      for (const m of ms) expanded.push({ ...t, mistakes: [m] })
    }
    return groupPerformance(expanded, (t) => t.mistakes?.[0])
  }, [filtered])

  const hold = useMemo(() => {
    const avg = (list: Trade[]) => {
      const ds = list.map(tradeDurationMs).filter((d) => d > 0)
      return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0
    }
    return {
      win: avg(filtered.filter((t) => tradePnl(t) > 0)),
      loss: avg(filtered.filter((t) => tradePnl(t) < 0)),
    }
  }, [filtered])

  const returnPct = baseEquity ? (stats.netPnl / baseEquity) * 100 : null
  const recovery = stats.maxDrawdown > 0 ? stats.netPnl / stats.maxDrawdown : null
  const consistency = stats.tradingDays ? (stats.greenDays / stats.tradingDays) * 100 : 0
  const showSides = sides.long.count > 0 || sides.short.count > 0
  const hasEmotion = byEmotion.some((g) => g.key !== 'Sin indicar')
  const hasProcess = hasEmotion || byRating.length > 0 || byMistake.length > 0

  const insights = useMemo(
    () =>
      buildInsights({
        stats,
        currency: settings.currency,
        weekday: byWeekday,
        hour: byHour,
        strategy: strategyPerf,
        emotion: byEmotion,
        long: sides.long,
        short: sides.short,
      }),
    [stats, settings.currency, byWeekday, byHour, strategyPerf, byEmotion, sides],
  )

  const pfTrend = range === 'all' ? undefined : deltaPct(stats.profitFactor, prevStats.profitFactor)
  const expTrend = range === 'all' ? undefined : deltaPct(stats.expectancy, prevStats.expectancy)
  const wrTrend = range === 'all' ? undefined : deltaPct(stats.winRate, prevStats.winRate)
  const pnlTrend = range === 'all' ? undefined : deltaPct(stats.netPnl, prevStats.netPnl)

  if (!trades.length) {
    return (
      <>
        <Topbar title={t('an.title')} />
        <div className="flex-1 flex items-center justify-center">
          <Empty
            icon={<BarChart3 size={20} />}
            title={t('an.noData')}
            description={t('an.noDataHint')}
          />
        </div>
      </>
    )
  }

  const groupOptions: { value: GroupBy; label: string }[] = [
    { value: 'strategy', label: t('an.by.strategy') },
    { value: 'symbol', label: t('an.by.symbol') },
    { value: 'market', label: t('an.by.market') },
    { value: 'tag', label: t('an.by.tag') },
    ...(hasSetup ? [{ value: 'setup' as const, label: t('an.by.setup') }] : []),
  ]

  return (
    <>
      <Topbar title={t('an.title')} subtitle={settings.accountName} />

      <AnalyticsLayout
        hero={
        <section className="relative overflow-hidden card px-7 py-6 lg:px-8 lg:py-7 animate-rise">
          <div
            className={clsx(
              'pointer-events-none absolute -top-24 -left-16 w-[28rem] h-[28rem] rounded-full blur-3xl animate-glow-breathe',
              stats.netPnl >= 0 ? 'bg-accent/15' : 'bg-loss/15',
            )}
          />
          <div className="relative">
            <div className="flex items-center justify-end mb-7">
              <div className="inline-flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted leading-none">
                  {t('an.period')}
                </span>
                <Segmented size="sm" value={range} onChange={setRange} options={rangeOptions(locale)} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-8 lg:gap-14 items-end">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  {t('an.netPnl', { hint: rangeHint(locale, range) })}
                </div>
                <div className="flex items-end gap-3 mt-3">
                  <Pnl value={stats.netPnl} className="text-[42px] font-semibold tracking-tight leading-none">
                    {fmtMoney(heroPnl, settings.currency, { sign: true })}
                  </Pnl>
                  {pnlTrend !== undefined && (
                    <span className="mb-1">
                      <Trend value={pnlTrend} />
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-muted mt-3 leading-relaxed">
                  {returnPct !== null ? (
                    <span className={clsx(returnPct >= 0 ? 'text-accent' : 'text-loss')}>{fmtPct(returnPct, 1, { sign: true })}</span>
                  ) : (
                    <span className="text-dim">—</span>
                  )}
                  <span className="text-dim">{t('an.onEquity')}</span>
                  {t('an.opsN', { n: stats.total })}
                  {stats.tradingDays ? ` · ${t('an.daysN', { n: stats.tradingDays })}` : ''}
                  {stats.fees ? ` · ${t('an.feesN', { n: fmtMoney(stats.fees, settings.currency) })}` : ''}
                </p>
              </div>

              <div className="min-w-0">
                <div className="flex items-center justify-between text-[11px] text-muted mb-2">
                  <span>{t('an.wlMix')}</span>
                  <span className="num">
                    <span className="text-accent">{stats.wins}W</span>
                    <span className="text-dim"> / </span>
                    <span className="text-loss">{stats.losses}L</span>
                    {stats.breakeven ? <span className="text-dim"> · {stats.breakeven} BE</span> : null}
                  </span>
                </div>
                <WinLossBar wins={stats.wins} losses={stats.losses} />
                {stats.tradingDays ? (
                  <p className="text-[12px] text-dim mt-2.5">
                    {t('an.perDayGreen', { pnl: fmtMoney(stats.avgDailyPnl, settings.currency, { sign: true }), pct: fmtNum(consistency, 0) })}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-8 pt-7 border-t border-border grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <EdgeMetric
                label="Win rate"
                value={`${fmtNum(stats.winRate, 0)}%`}
                trend={wrTrend}
                hint={`${stats.wins}W / ${stats.losses}L`}
                ring={stats.winRate}
              />
              <EdgeMetric
                label="Profit factor"
                value={stats.profitFactor === Infinity ? '∞' : fmtNum(stats.profitFactor, 2)}
                trend={pfTrend}
                hint={stats.grossLoss ? t('an.gross', { n: fmtMoney(stats.grossProfit, settings.currency) }) : t('an.noLosses')}
              />
              <EdgeMetric
                label={t('dash.expectancy')}
                value={fmtMoney(stats.expectancy, settings.currency, { sign: true })}
                trend={expTrend}
                hint={t('an.perClosed')}
              />
              <EdgeMetric
                label={t('an.avgR')}
                value={stats.rCount ? fmtR(stats.avgR) : '—'}
                hint={stats.rCount ? t('an.withStop', { n: stats.rCount }) : t('an.addStops')}
              />
              <EdgeMetric
                label={t('stats.payoff')}
                value={fmtPayoff(stats.payoffRatio)}
                hint={
                  stats.avgWin || stats.avgLoss
                    ? `${fmtMoney(stats.avgWin, settings.currency, { sign: true })} / ${fmtMoney(-stats.avgLoss || 0, settings.currency)}`
                    : t('an.avgWL')
                }
              />
            </div>

            {insights.length > 0 && (
              <div className="mt-7 grid grid-cols-1 md:grid-cols-3 gap-3">
                {insights.map((ins, i) => (
                  <InsightCard key={ins.id} insight={ins} delay={i} />
                ))}
              </div>
            )}
          </div>
        </section>
        }
        originLabel={t('an.origin')}
        origin={
          showSides ? (
            <div className="animate-rise delay-2">
              <PnLOriginHeader
                long={sides.long}
                short={sides.short}
                currency={settings.currency}
                longLabel={t('an.longs')}
                shortLabel={t('an.shorts')}
              />
            </div>
          ) : null
        }
        category={
          <div className="animate-rise delay-2">
            <PerformanceByCategory
              groups={groups}
              currency={settings.currency}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              groupOptions={groupOptions}
              sort={sort}
              onSort={setSort}
              title={t('an.byCategory')}
              subtitle={groupBy === 'tag' ? t('an.tagHint') : t('an.edgeWhere')}
            />
          </div>
        }
        timeLabel={t('an.time')}
        timeWeekday={
          <Card className="animate-rise delay-3" title={t('an.byWeekday')} subtitle={t('an.byWeekdaySub')}>
            <WeekStrip data={byWeekday} currency={settings.currency} />
          </Card>
        }
        timeEntry={
          <Card
            className="animate-rise delay-3"
            title={timeView === 'hour' ? t('an.byHour') : t('an.byMonth')}
            subtitle={timeView === 'hour' ? t('an.byHourSub') : t('an.byMonthSub')}
            action={
              <Segmented
                size="sm"
                value={timeView}
                onChange={setTimeView}
                options={[
                  { value: 'hour', label: t('an.hour') },
                  { value: 'month', label: t('an.month') },
                ]}
              />
            }
          >
            {timeView === 'hour' ? (
              byHour.length ? (
                <CategoryBars data={byHour} currency={settings.currency} height={240} labelFormatter={(k) => `${k}h`} />
              ) : (
                <Empty title={t('an.noDataShort')} />
              )
            ) : byMonth.length ? (
              <CategoryBars
                data={byMonth}
                currency={settings.currency}
                height={240}
                labelFormatter={(k) =>
                  new Date(k + '-01T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
                    month: 'short',
                    year: '2-digit',
                  })
                }
              />
            ) : (
              <Empty title={t('an.noDataShort')} />
            )}
          </Card>
        }
        riskLabel={t('an.risk')}
        riskRDist={
          <RDistribution
            trades={filtered}
            title={t('an.rDist')}
            subtitle={t('an.rDistSub')}
            emptyTitle={t('an.noStops')}
            emptyHint={t('an.noStopsHint')}
          />
        }
        riskDrawdown={
          <Card title={t('chart.drawdown')} subtitle={t('an.ddSub')}>
            {curve.length ? (
              <DrawdownChart data={curve} currency={settings.currency} height={228} />
            ) : (
              <Empty title={t('an.empty')} />
            )}
          </Card>
        }
        riskEdge={
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-5 lg:gap-6 animate-rise delay-4">
            <Card title={t('an.edgeQuality')} subtitle={t('an.edgeQualitySub')}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <PayoffBars avgWin={stats.avgWin} avgLoss={stats.avgLoss} currency={settings.currency} />
                <div className="flex flex-col gap-4">
                  <QualityRow label={t('an.streakNow')} value={fmtStreak(stats.currentStreak)} />
                  <QualityRow label={t('an.bestWorst')} value={`${fmtStreak(stats.bestStreak)} · ${fmtStreak(stats.worstStreak)}`} />
                  <QualityRow
                    label={t('stats.extremes')}
                    value={
                      stats.largestWin || stats.largestLoss
                        ? `${fmtMoney(stats.largestWin, settings.currency, { sign: true })} / ${fmtMoney(stats.largestLoss, settings.currency)}`
                        : '—'
                    }
                  />
                  <QualityRow label={t('an.holdWL')} value={`${fmtDuration(hold.win)} / ${fmtDuration(hold.loss)}`} />
                </div>
              </div>
            </Card>
            <Card title={t('an.riskMetrics')} subtitle={t('an.riskMetricsSub')}>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat
                  label={t('an.maxDd')}
                  value={stats.maxDrawdown ? `−${fmtMoney(stats.maxDrawdown, settings.currency)}` : fmtMoney(0, settings.currency)}
                  hint={stats.maxDrawdown ? `${fmtNum(stats.maxDrawdownPct, 1)}%` : undefined}
                  tone="red"
                />
                <MiniStat label="Sharpe" value={fmtNum(stats.sharpe, 2)} hint={stats.tradingDays < 10 ? t('an.smallSample') : t('an.sharpeHint')} />
                <MiniStat label={t('an.recovery')} value={recovery === null ? '—' : fmtNum(recovery, 2)} hint={t('an.recoveryHint')} />
                <MiniStat
                  label={t('an.greenDays')}
                  value={`${fmtNum(consistency, 0)}%`}
                  hint={`${stats.greenDays} / ${stats.tradingDays || 0}`}
                  tone={consistency >= 55 ? 'green' : consistency >= 40 ? 'amber' : 'red'}
                />
              </div>
            </Card>
          </div>
        }
        processLabel={hasProcess ? t('an.process') : undefined}
        process={
          hasProcess ? (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 animate-rise delay-5">
                {hasEmotion && (
                  <Card title={t('an.emotion')} subtitle={t('an.emotionSub')}>
                    <HBars groups={byEmotion} currency={settings.currency} maxItems={8} />
                  </Card>
                )}
                {byRating.length > 0 && (
                  <Card title={t('an.perceived')} subtitle={t('an.ratingSub')}>
                    <RatingStrip groups={byRating} currency={settings.currency} />
                  </Card>
                )}
              </div>
              {byMistake.length > 0 && (
                <Card className="animate-rise delay-5" title={t('an.mistakesTitle')} subtitle={t('an.mistakesSub')}>
                  <HBars groups={byMistake} currency={settings.currency} />
                </Card>
              )}
            </>
          ) : null
        }
      />
    </>
  )
}

function useCountUp(value: number, duration = 820) {
  const [n, setN] = useState(value)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !Number.isFinite(value)) {
      setN(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setN(value * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return n
}

function EdgeMetric({
  label,
  value,
  hint,
  trend,
  ring,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  trend?: number | null
  ring?: number
}) {
  return (
    <div className="min-w-0 metric-tile transition-colors hover:border-border-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
            {trend !== undefined && <Trend value={trend} />}
          </div>
          <div className="num text-[18px] font-semibold tracking-tight mt-2.5 text-text leading-none">{value}</div>
          {hint != null && hint !== '' && <div className="text-[12px] text-dim mt-1.5 leading-snug truncate">{hint}</div>}
        </div>
        {ring !== undefined && <Ring value={ring} size={40} stroke={3.5} />}
      </div>
    </div>
  )
}

function WinLossBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses
  if (!total) return <div className="h-2 rounded-full bg-surface-3" />
  const w = (wins / total) * 100
  return (
    <div className="h-2 rounded-full overflow-hidden flex bg-surface-3">
      <div className="h-full bg-accent transition-all duration-700" style={{ width: `${w}%` }} />
      <div className="h-full bg-loss/80 transition-all duration-700" style={{ width: `${100 - w}%` }} />
    </div>
  )
}

type Insight = { id: string; tone: 'green' | 'red' | 'amber' | 'sky'; kicker: string; title: string; detail: string }

function InsightCard({ insight, delay }: { insight: Insight; delay: number }) {
  const rail = { green: 'bg-accent', red: 'bg-loss', amber: 'bg-amber', sky: 'bg-sky' }[insight.tone]
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-surface-2/40 px-4 py-3.5 animate-insight"
      style={{ animationDelay: `${180 + delay * 90}ms` }}
    >
      <span className={clsx('absolute left-0 top-3 bottom-3 w-[2px] rounded-full', rail)} />
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dim pl-2">{insight.kicker}</div>
      <div className="text-[13px] font-semibold tracking-tight mt-1 pl-2 leading-snug">{insight.title}</div>
      <div className="text-[12px] text-muted mt-1 pl-2 leading-relaxed">{insight.detail}</div>
    </div>
  )
}

function HBars({ groups, currency, maxItems = 8 }: { groups: GroupPerf[]; currency: Currency; maxItems?: number }) {
  const rows = groups.slice(0, maxItems)
  const max = Math.max(...rows.map((g) => Math.abs(g.pnl)), 1)
  return (
    <div className="flex flex-col gap-4">
      {rows.map((g) => (
        <div key={g.key} className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{displayGroupKey(getAppLocale(), g.key)}</span>
            <Pnl value={g.pnl} className="font-semibold text-[13px] shrink-0">
              {fmtMoney(g.pnl, currency, { sign: true })}
            </Pnl>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex-1 h-[5px] rounded-full bg-surface-3 overflow-hidden">
              <div
                className={clsx('h-full rounded-full origin-left transition-all duration-700', g.pnl >= 0 ? 'bg-accent' : 'bg-loss')}
                style={{ width: `${Math.max(6, (Math.abs(g.pnl) / max) * 100)}%` }}
              />
            </div>
            <span className="num text-[11px] text-muted shrink-0 w-[4.5rem] text-right">
              <span className="text-accent">{g.wins}W</span>
              <span className="text-dim"> / </span>
              <span className="text-loss">{g.losses}L</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function WeekStrip({ data, currency }: { data: GroupPerf[]; currency: Currency }) {
  const max = Math.max(...data.map((d) => Math.abs(d.pnl)), 1)
  return (
    <div className="grid grid-cols-7 gap-2 sm:gap-3">
      {data.map((d) => {
        const h = d.count ? Math.max(10, (Math.abs(d.pnl) / max) * 100) : 6
        return (
          <div key={d.key} className="flex flex-col items-center min-w-0">
            <div className="h-32 w-full flex items-end rounded-2xl bg-surface-2 border border-border p-1.5">
              <div
                className={clsx(
                  'w-full rounded-xl origin-bottom animate-bar-grow',
                  d.count === 0 ? 'bg-surface-3' : d.pnl >= 0 ? 'bg-accent' : 'bg-loss',
                )}
                style={{ height: `${h}%`, opacity: d.count ? 0.9 : 0.35 }}
              />
            </div>
            <div className="mt-2.5 text-[11px] font-semibold text-muted">{weekdayShort(getAppLocale(), Number(d.key))}</div>
            <Pnl value={d.pnl} className="text-[12px] font-semibold mt-0.5 truncate max-w-full">
              {d.count ? fmtMoney(d.pnl, currency, { sign: true, compact: true }) : '—'}
            </Pnl>
            <div className="num text-[10px] text-dim mt-0.5">{d.count ? `${d.count} ops` : '·'}</div>
          </div>
        )
      })}
    </div>
  )
}

function PayoffBars({ avgWin, avgLoss, currency }: { avgWin: number; avgLoss: number; currency: Currency }) {
  const max = Math.max(avgWin, avgLoss, 1)
  return (
    <div className="flex flex-col gap-5 justify-center">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Ganancia media</span>
          <Pnl value={avgWin} className="text-[13px] font-semibold">
            {fmtMoney(avgWin, currency, { sign: true })}
          </Pnl>
        </div>
        <div className="mt-2 h-2 rounded-full bg-surface-3 overflow-hidden">
          <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${(avgWin / max) * 100}%` }} />
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Pérdida media</span>
          <Pnl value={-avgLoss} className="text-[13px] font-semibold">
            {fmtMoney(-avgLoss || 0, currency)}
          </Pnl>
        </div>
        <div className="mt-2 h-2 rounded-full bg-surface-3 overflow-hidden">
          <div className="h-full rounded-full bg-loss transition-[width] duration-700" style={{ width: `${(avgLoss / max) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

function QualityRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="num text-[13px] font-semibold text-right">{value}</span>
    </div>
  )
}

function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'green' | 'red' | 'amber'
}) {
  const color = tone === 'green' ? 'text-accent' : tone === 'red' ? 'text-loss' : tone === 'amber' ? 'text-amber' : 'text-text'
  return (
    <div className="rounded-2xl bg-surface-2/70 border border-border px-4 py-4">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className={clsx('num text-[17px] font-semibold tracking-tight mt-2 leading-none', color)}>{value}</div>
      {hint && <div className="text-[11px] text-dim mt-1.5">{hint}</div>}
    </div>
  )
}

function RatingStrip({ groups, currency }: { groups: GroupPerf[]; currency: Currency }) {
  const max = Math.max(...groups.map((g) => Math.abs(g.pnl)), 1)
  return (
    <div className="grid grid-cols-5 gap-2.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const g = groups.find((x) => x.key === String(star))
        const pnl = g?.pnl ?? 0
        const h = g?.count ? Math.max(12, (Math.abs(pnl) / max) * 100) : 8
        return (
          <div key={star} className="flex flex-col items-center min-w-0">
            <div className="h-28 w-full flex items-end rounded-2xl bg-surface-2 border border-border p-1.5">
              <div
                className={clsx('w-full rounded-xl origin-bottom animate-bar-grow', !g?.count ? 'bg-surface-3' : pnl >= 0 ? 'bg-accent' : 'bg-loss')}
                style={{ height: `${h}%`, opacity: g?.count ? 0.9 : 0.3 }}
              />
            </div>
            <div className="mt-2">
              <Stars value={star} size={10} />
            </div>
            <Pnl value={pnl} className="text-[11px] font-semibold mt-1 truncate max-w-full">
              {g?.count ? fmtMoney(pnl, currency, { sign: true, compact: true }) : '—'}
            </Pnl>
            <div className="num text-[10px] text-dim">{g?.count ? `${g.count}` : '·'}</div>
          </div>
        )
      })}
    </div>
  )
}

function buildInsights(input: {
  stats: ReturnType<typeof computeStats>
  currency: Currency
  weekday: GroupPerf[]
  hour: GroupPerf[]
  strategy: GroupPerf[]
  emotion: GroupPerf[]
  long: GroupPerf
  short: GroupPerf
}): Insight[] {
  const { stats, currency, weekday, hour, strategy, emotion, long, short } = input
  const out: Insight[] = []

  const daysWith = weekday.filter((d) => d.count >= 3)
  if (daysWith.length >= 2) {
    const best = daysWith.reduce((a, b) => (b.pnl > a.pnl ? b : a))
    const worst = daysWith.reduce((a, b) => (b.pnl < a.pnl ? b : a))
    if (best.pnl > 0) {
      out.push({
        id: 'best-day',
        tone: 'green',
        kicker: tx(getAppLocale(), 'an.ins.time'),
        title: `${weekdayShort(getAppLocale(), Number(best.key))} · ${best.count}`,
        detail: tx(getAppLocale(), 'an.ins.inNWr', { pnl: fmtMoney(best.pnl, currency, { sign: true }), n: best.count, wr: best.winRate.toFixed(0) }),
      })
    }
    if (worst.pnl < 0 && worst.key !== best.key) {
      out.push({
        id: 'worst-day',
        tone: 'red',
        kicker: tx(getAppLocale(), 'an.ins.time'),
        title: `${weekdayShort(getAppLocale(), Number(worst.key))} · ${worst.count}`,
        detail: tx(getAppLocale(), 'an.ins.inN', { pnl: fmtMoney(worst.pnl, currency, { sign: true }), n: worst.count }),
      })
    }
  }

  if (long.count >= 5 && short.count >= 5) {
    const better = long.pnl >= short.pnl ? long : short
    const worse = better === long ? short : long
    if (Math.abs(better.pnl - worse.pnl) > Math.max(80, Math.abs(stats.netPnl) * 0.12)) {
      out.push({
        id: 'side',
        tone: better.key === 'LONG' ? 'green' : 'sky',
        kicker: tx(getAppLocale(), 'an.ins.dir'),
        title: better.key === 'LONG' ? tx(getAppLocale(), 'an.ins.longs') : tx(getAppLocale(), 'an.ins.shorts'),
        detail: tx(getAppLocale(), 'an.ins.vs', { a: fmtMoney(better.pnl, currency, { sign: true }), b: fmtMoney(worse.pnl, currency, { sign: true }) }),
      })
    }
  }

  const top = strategy.filter((g) => g.key !== 'Sin estrategia' && g.count >= 3)
  if (top.length) {
    const lead = [...top].sort((a, b) => b.pnl - a.pnl)[0]
    if (lead.pnl > 0) {
      out.push({
        id: 'strategy',
        tone: 'green',
        kicker: tx(getAppLocale(), 'an.by.strategy'),
        title: tx(getAppLocale(), 'an.ins.strategyLead', { name: lead.key }),
        detail: `${fmtMoney(lead.pnl, currency, { sign: true })} · PF ${lead.profitFactor === Infinity ? '∞' : fmtNum(lead.profitFactor, 2)}`,
      })
    }
  }

  const toxic = emotion.filter((e) => ['FOMO', 'Venganza', 'Ansioso', 'Aburrido', 'Cansado'].includes(e.key) && e.pnl < 0 && e.count >= 2)
  if (toxic.length) {
    const worstE = toxic.reduce((a, b) => (a.pnl < b.pnl ? a : b))
    out.push({
      id: 'emotion',
      tone: 'red',
      kicker: tx(getAppLocale(), 'an.process'),
      title: tx(getAppLocale(), 'an.ins.emotionCost', { name: emotionLabel(getAppLocale(), worstE.key as import('@/types').Emotion) }),
      detail: tx(getAppLocale(), 'an.ins.inN', { pnl: fmtMoney(worstE.pnl, currency, { sign: true }), n: worstE.count }),
    })
  }

  if (stats.avgWin > 0 && stats.avgLoss > stats.avgWin * 1.35 && stats.winRate >= 50) {
    out.push({
      id: 'payoff',
      tone: 'amber',
      kicker: tx(getAppLocale(), 'an.risk'),
      title: tx(getAppLocale(), 'an.ins.payoff'),
      detail: tx(getAppLocale(), 'an.ins.payoffSub', {
        w: fmtMoney(stats.avgWin, currency),
        l: fmtMoney(-stats.avgLoss, currency),
      }),
    })
  }

  if (stats.maxDrawdown > 0 && stats.netPnl > 0 && stats.maxDrawdown > stats.netPnl * 0.6) {
    out.push({
      id: 'dd',
      tone: 'amber',
      kicker: tx(getAppLocale(), 'an.risk'),
      title: tx(getAppLocale(), 'an.ins.dd'),
      detail: tx(getAppLocale(), 'an.ins.ddSub', {
        dd: fmtMoney(stats.maxDrawdown, currency),
        pnl: fmtMoney(stats.netPnl, currency, { sign: true }),
      }),
    })
  }

  const hoursWith = hour.filter((h) => h.count >= 3)
  if (hoursWith.length >= 2) {
    const bestH = hoursWith.reduce((a, b) => (b.pnl > a.pnl ? b : a))
    if (bestH.pnl > 0) {
      out.push({
        id: 'hour',
        tone: 'sky',
        kicker: tx(getAppLocale(), 'an.ins.session'),
        title: tx(getAppLocale(), 'an.ins.hour', { h: bestH.key }),
        detail: tx(getAppLocale(), 'an.ins.hourSub', {
          pnl: fmtMoney(bestH.pnl, currency, { sign: true }),
          n: bestH.count,
        }),
      })
    }
  }

  if (stats.tradingDays >= 6) {
    const cons = (stats.greenDays / stats.tradingDays) * 100
    out.push({
      id: 'consistency',
      tone: cons >= 55 ? 'green' : cons >= 40 ? 'amber' : 'red',
      kicker: tx(getAppLocale(), 'an.ins.consistency'),
      title: tx(getAppLocale(), 'an.ins.greenPct', { pct: Math.round(cons) }),
      detail: tx(getAppLocale(), 'an.ins.greenSub', {
        g: stats.greenDays,
        r: stats.redDays,
        d: stats.tradingDays,
      }),
    })
  }

  const priority = ['payoff', 'emotion', 'side', 'best-day', 'strategy', 'dd', 'hour', 'consistency', 'worst-day']
  out.sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))
  const used = new Set<string>()
  const unique: Insight[] = []
  for (const ins of out) {
    if (used.has(ins.kicker)) continue
    used.add(ins.kicker)
    unique.push(ins)
    if (unique.length === 3) break
  }
  return unique
}
