import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { BarChart3, PenLine, Star } from 'lucide-react'
import { useStore } from '@/store'
import { Topbar } from '@/components/Topbar'
import { Empty, Pnl, Ring, Segmented, Trend } from '@/components/ui'
import { CategoryBars, DrawdownChart } from '@/components/charts'
import {
  AnalyticsCard,
  AnalyticsLayout,
  Detail,
  Kicker,
  MagnitudeBar,
  MetricTile,
  PerformanceByCategory,
  PnLOriginHeader,
  SCROLL_X,
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

  const lineTone = stats.netPnl > 0 ? 'rgba(74,222,128,0.5)' : stats.netPnl < 0 ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.22)'
  const cur = settings.currency
  const processCards = [
    hasEmotion && (
      <AnalyticsCard key="emotion" className="h-full" title={t('an.emotion')} subtitle={t('an.emotionSub')}>
        <HBars groups={byEmotion} currency={cur} maxItems={8} />
      </AnalyticsCard>
    ),
    byRating.length > 0 && (
      <AnalyticsCard key="rating" className="h-full" title={t('an.perceived')} subtitle={t('an.ratingSub')}>
        <RatingStrip groups={byRating} currency={cur} />
      </AnalyticsCard>
    ),
    byMistake.length > 0 && (
      <AnalyticsCard key="mistakes" className="h-full" title={t('an.mistakesTitle')} subtitle={t('an.mistakesSub')}>
        <HBars groups={byMistake} currency={cur} />
      </AnalyticsCard>
    ),
  ].filter(Boolean) as ReactNode[]

  return (
    <>
      <Topbar title={t('an.title')} subtitle={settings.accountName} />

      <AnalyticsLayout
        summaryLabel={{ title: t('an.sec.summary'), subtitle: t('an.sec.summarySub') }}
        hero={
          <section className="card relative overflow-hidden animate-rise">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px transition-[background,box-shadow] duration-500"
              style={{ background: `linear-gradient(90deg, transparent, ${lineTone} 50%, transparent)`, boxShadow: `0 0 14px ${lineTone}` }}
            />
            <div
              className="pointer-events-none absolute left-1/2 -top-40 -ml-[340px] h-[320px] w-[680px] rounded-full"
              style={{ background: 'radial-gradient(closest-side, rgba(228,228,235,0.06), transparent 75%)' }}
            />

            <div className="relative p-5 sm:p-6 lg:px-7 lg:py-7">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  {t('an.netPnl', { hint: rangeHint(locale, range) })}
                </div>
                <div className={clsx('no-drag max-w-full', SCROLL_X)}>
                  <Segmented size="sm" value={range} onChange={setRange} options={rangeOptions(locale)} />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-10 lg:gap-12">
                <div className="min-w-0">
                  <div
                    className={clsx(
                      'num truncate text-[34px] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[40px]',
                      stats.netPnl < 0 ? 'text-loss' : 'text-gradient',
                    )}
                  >
                    {fmtMoney(heroPnl, cur, { sign: true })}
                  </div>
                  <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px]">
                    <DeltaPill value={returnPct} />
                    <span className="text-dim">{t('an.onEquityShort')}</span>
                    {pnlTrend !== undefined && (
                      <>
                        <span className="text-border-3" aria-hidden>
                          ·
                        </span>
                        <Trend value={pnlTrend} />
                        <span className="text-dim">{t('an.vsPrev')}</span>
                      </>
                    )}
                  </div>
                  <p className="num mt-2 text-[12px] text-dim">
                    {t('an.opsN', { n: stats.total })}
                    {stats.tradingDays ? ` · ${t('an.daysN', { n: stats.tradingDays })}` : ''}
                    {stats.fees ? ` · ${t('an.feesN', { n: fmtMoney(stats.fees, cur) })}` : ''}
                  </p>
                </div>

                <div className="min-w-0 border-t border-white/[0.06] pt-5 md:border-l md:border-t-0 md:pl-10 md:pt-0 lg:pl-12">
                  <div className="flex items-baseline justify-between gap-3">
                    <Kicker>{t('an.wlMix')}</Kicker>
                    <span className="num text-[12px] font-semibold">
                      <span className="text-accent">{stats.wins}W</span>
                      <span className="text-dim"> / </span>
                      <span className="text-loss">{stats.losses}L</span>
                      {stats.breakeven ? <span className="font-normal text-dim"> · {stats.breakeven} BE</span> : null}
                    </span>
                  </div>
                  <WinLossBar wins={stats.wins} losses={stats.losses} />
                  <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
                    <Detail
                      label={t('an.avgDay')}
                      value={stats.tradingDays ? fmtMoney(stats.avgDailyPnl, cur, { sign: true }) : '—'}
                      tone={!stats.tradingDays || stats.avgDailyPnl === 0 ? undefined : stats.avgDailyPnl > 0 ? 'green' : 'red'}
                    />
                    <Detail
                      label={t('an.greenDays')}
                      value={stats.tradingDays ? `${fmtNum(consistency, 0)}%` : '—'}
                      hint={stats.tradingDays ? `${stats.greenDays} / ${stats.tradingDays}` : undefined}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-6 sm:grid-cols-3 xl:grid-cols-5">
                <MetricTile
                  label={t('an.winRate')}
                  value={`${fmtNum(stats.winRate, 0)}%`}
                  trend={wrTrend}
                  hint={`${stats.wins}W / ${stats.losses}L`}
                  aside={<Ring value={stats.winRate} size={36} stroke={3} track="rgba(255,255,255,0.06)" />}
                />
                <MetricTile
                  label={t('an.profitFactor')}
                  value={stats.profitFactor === Infinity ? '∞' : fmtNum(stats.profitFactor, 2)}
                  trend={pfTrend}
                  hint={stats.grossLoss ? t('an.gross', { n: fmtMoney(stats.grossProfit, cur) }) : t('an.noLosses')}
                />
                <MetricTile
                  label={t('dash.expectancy')}
                  value={fmtMoney(stats.expectancy, cur, { sign: true })}
                  tone={stats.expectancy > 0 ? 'green' : stats.expectancy < 0 ? 'red' : undefined}
                  trend={expTrend}
                  hint={t('an.perClosed')}
                />
                <MetricTile
                  label={t('an.avgR')}
                  value={stats.rCount ? fmtR(stats.avgR) : '—'}
                  tone={stats.rCount ? (stats.avgR > 0 ? 'green' : stats.avgR < 0 ? 'red' : undefined) : undefined}
                  hint={stats.rCount ? t('an.withStop', { n: stats.rCount }) : t('an.addStops')}
                />
                <MetricTile
                  className="col-span-2 sm:col-span-1"
                  label={t('stats.payoff')}
                  value={fmtPayoff(stats.payoffRatio)}
                  hint={
                    stats.avgWin || stats.avgLoss
                      ? `${fmtMoney(stats.avgWin, cur, { sign: true })} / ${fmtMoney(-stats.avgLoss || 0, cur)}`
                      : t('an.avgWL')
                  }
                />
              </div>

              {insights.length > 0 && (
                <div className="mt-6">
                  <Kicker className="mb-3">{t('an.insights')}</Kicker>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {insights.map((ins, i) => (
                      <InsightCard key={ins.id} insight={ins} delay={i} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        }
        edgeLabel={{ title: t('an.sec.edge'), subtitle: t('an.sec.edgeSub') }}
        origin={
          showSides ? (
            <PnLOriginHeader
              long={sides.long}
              short={sides.short}
              currency={cur}
              longLabel={t('an.longs')}
              shortLabel={t('an.shorts')}
            />
          ) : null
        }
        category={
          <PerformanceByCategory
            groups={groups}
            currency={cur}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            groupOptions={groupOptions}
            sort={sort}
            onSort={setSort}
            title={t('an.byCategory')}
            subtitle={groupBy === 'tag' ? t('an.tagHint') : t('an.edgeWhere')}
          />
        }
        timeLabel={{ title: t('an.time'), subtitle: t('an.sec.timeSub') }}
        timeWeekday={
          <AnalyticsCard className="h-full" bodyClassName={CHART_BODY} title={t('an.byWeekday')} subtitle={t('an.byWeekdaySub')}>
            <WeekStrip data={byWeekday} currency={cur} />
          </AnalyticsCard>
        }
        timeEntry={
          <AnalyticsCard
            className="h-full"
            bodyClassName={CHART_BODY}
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
                <CategoryBars data={byHour} currency={cur} height={CHART_H} labelFormatter={(k) => `${k}h`} />
              ) : (
                <ChartEmpty title={t('an.noDataShort')} />
              )
            ) : byMonth.length ? (
              <CategoryBars
                data={byMonth}
                currency={cur}
                height={CHART_H}
                labelFormatter={(k) =>
                  new Date(k + '-01T00:00:00').toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
                    month: 'short',
                    year: '2-digit',
                  })
                }
              />
            ) : (
              <ChartEmpty title={t('an.noDataShort')} />
            )}
          </AnalyticsCard>
        }
        riskLabel={{ title: t('an.risk'), subtitle: t('an.sec.riskSub') }}
        riskRDist={
          <RDistribution
            trades={filtered}
            height={CHART_H}
            title={t('an.rDist')}
            subtitle={t('an.rDistSub')}
            emptyTitle={t('an.noStops')}
            emptyHint={t('an.noStopsHint')}
          />
        }
        riskDrawdown={
          <AnalyticsCard className="h-full" bodyClassName={CHART_BODY} title={t('chart.drawdown')} subtitle={t('an.ddSub')}>
            {curve.length ? <DrawdownChart data={curve} currency={cur} height={CHART_H} /> : <ChartEmpty title={t('an.empty')} />}
          </AnalyticsCard>
        }
        riskEdge={
          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-5">
            <AnalyticsCard className="h-full" title={t('an.edgeQuality')} subtitle={t('an.edgeQualitySub')}>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
                <PayoffBars avgWin={stats.avgWin} avgLoss={stats.avgLoss} currency={cur} />
                <div className="grid grid-cols-2 content-start gap-x-6 gap-y-4 border-t border-white/[0.06] pt-5 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
                  <Detail label={t('an.streakNow')} value={fmtStreak(stats.currentStreak)} />
                  <Detail label={t('an.bestWorst')} value={`${fmtStreak(stats.bestStreak)} · ${fmtStreak(stats.worstStreak)}`} />
                  <div className="col-span-2">
                    <Detail
                      label={t('stats.extremes')}
                      value={
                        stats.largestWin || stats.largestLoss ? (
                          <>
                            <Pnl value={stats.largestWin}>{fmtMoney(stats.largestWin, cur, { sign: true })}</Pnl>
                            <span className="text-dim"> / </span>
                            <Pnl value={stats.largestLoss}>{fmtMoney(stats.largestLoss, cur)}</Pnl>
                          </>
                        ) : (
                          '—'
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Detail label={t('an.holdWL')} value={`${fmtDuration(hold.win)} / ${fmtDuration(hold.loss)}`} />
                  </div>
                </div>
              </div>
            </AnalyticsCard>
            <AnalyticsCard className="h-full" title={t('an.riskMetrics')} subtitle={t('an.riskMetricsSub')}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Detail
                  size="lg"
                  label={t('an.maxDd')}
                  value={stats.maxDrawdown ? `−${fmtMoney(stats.maxDrawdown, cur)}` : fmtMoney(0, cur)}
                  tone={stats.maxDrawdown ? 'red' : undefined}
                  hint={stats.maxDrawdown ? `${fmtNum(stats.maxDrawdownPct, 1)}%` : undefined}
                />
                <Detail
                  size="lg"
                  label={t('an.sharpe')}
                  value={fmtNum(stats.sharpe, 2)}
                  hint={stats.tradingDays < 10 ? t('an.smallSample') : t('an.sharpeHint')}
                  hintTone={stats.tradingDays < 10 ? 'amber' : undefined}
                />
                <Detail size="lg" label={t('an.recovery')} value={recovery === null ? '—' : fmtNum(recovery, 2)} hint={t('an.recoveryHint')} />
                <Detail
                  size="lg"
                  label={t('an.greenDays')}
                  value={`${fmtNum(consistency, 0)}%`}
                  hint={`${stats.greenDays} / ${stats.tradingDays || 0}`}
                  tone={consistency >= 55 ? 'green' : consistency >= 40 ? 'amber' : 'red'}
                />
              </div>
            </AnalyticsCard>
          </div>
        }
        processLabel={{ title: t('an.process'), subtitle: t('an.sec.processSub') }}
        process={
          hasProcess ? (
            <div className="grid grid-cols-1 items-stretch gap-4 lg:gap-5 xl:grid-cols-2">
              {processCards.map((card, i) => (
                <div key={i} className={clsx('min-w-0', processCards.length % 2 === 1 && i === processCards.length - 1 && 'xl:col-span-2')}>
                  {card}
                </div>
              ))}
            </div>
          ) : (
            <AnalyticsCard>
              <div className="flex items-start gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-2 bg-surface-3 text-muted">
                  <PenLine size={15} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold tracking-tight">{t('an.processEmpty')}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t('an.processEmptyHint')}</p>
                </div>
              </div>
            </AnalyticsCard>
          )
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

const CHART_H = 220
const CHART_BODY = 'flex flex-col justify-end'

function ChartEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex h-full min-h-[220px] items-center justify-center">
      <Empty title={title} description={description} />
    </div>
  )
}

function DeltaPill({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-dim">—</span>
  const up = value >= 0
  return (
    <span
      className={clsx(
        'num inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-semibold',
        up ? 'border-accent/20 bg-accent/10 text-accent' : 'border-loss/20 bg-loss/10 text-loss',
      )}
    >
      {fmtPct(value, 1, { sign: true })}
    </span>
  )
}

function WinLossBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses
  if (!total) return <div className="mt-2.5 h-1.5 rounded-full bg-white/[0.05]" />
  const w = (wins / total) * 100
  return (
    <div className="mt-2.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-white/[0.05]">
      <div className="h-full rounded-l-full bg-accent/85 transition-all duration-700" style={{ width: `${w}%` }} />
      <div className="h-full rounded-r-full bg-loss/80 transition-all duration-700" style={{ width: `${100 - w}%` }} />
    </div>
  )
}

type Insight = { id: string; tone: 'green' | 'red' | 'amber' | 'sky'; kicker: string; title: string; detail: string }

function InsightCard({ insight, delay }: { insight: Insight; delay: number }) {
  const rail = { green: 'bg-accent', red: 'bg-loss', amber: 'bg-amber', sky: 'bg-sky' }[insight.tone]
  return (
    <div
      className="relative min-w-0 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015] py-3 pl-4 pr-3.5 animate-section-rise"
      style={{ animationDelay: `${160 + delay * 70}ms` }}
    >
      <span className={clsx('absolute bottom-3 left-0 top-3 w-[2px] rounded-r-full', rail)} />
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">{insight.kicker}</div>
      <div className="mt-1 text-[13px] font-semibold leading-snug tracking-tight">{insight.title}</div>
      <div className="num mt-0.5 text-[12px] leading-relaxed text-muted">{insight.detail}</div>
    </div>
  )
}

function HBars({ groups, currency, maxItems = 8 }: { groups: GroupPerf[]; currency: Currency; maxItems?: number }) {
  const rows = groups.slice(0, maxItems)
  const max = Math.max(...rows.map((g) => Math.abs(g.pnl)), 1)
  return (
    <div className="flex flex-col divide-y divide-white/[0.05]">
      {rows.map((g) => (
        <div key={g.key} className="min-w-0 py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{displayGroupKey(getAppLocale(), g.key)}</span>
            <span className="num shrink-0 text-[11px] text-muted">
              {g.wins}
              <span className="text-dim">/</span>
              {g.losses}
            </span>
            <Pnl value={g.pnl} className="w-24 shrink-0 truncate text-right text-[13px] font-semibold">
              {fmtMoney(g.pnl, currency, { sign: true })}
            </Pnl>
          </div>
          <MagnitudeBar className="mt-2" pct={(Math.abs(g.pnl) / max) * 100} positive={g.pnl >= 0} />
        </div>
      ))}
    </div>
  )
}

function StripBar({ pnl, count, max, height, delay }: { pnl: number; count: number; max: number; height: string; delay: number }) {
  const h = count ? Math.max(8, (Math.abs(pnl) / max) * 100) : 4
  return (
    <div className={clsx('flex w-full items-end rounded-xl border border-white/[0.04] bg-white/[0.02] p-1', height)}>
      <div
        className={clsx(
          'w-full origin-bottom rounded-lg animate-bar-grow',
          count === 0 ? 'bg-white/[0.06]' : pnl >= 0 ? 'bg-accent/80' : 'bg-loss/75',
        )}
        style={{ height: `${h}%`, animationDelay: `${delay}ms` }}
      />
    </div>
  )
}

function StripRows({
  rows,
  currency,
  max,
}: {
  rows: { key: string; label: ReactNode; pnl: number; count: number }[]
  currency: Currency
  max: number
}) {
  return (
    <div className="flex flex-col gap-2.5 sm:hidden">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3">
          <span className="text-[11px] font-semibold text-muted">{r.label}</span>
          <MagnitudeBar pct={r.count ? (Math.abs(r.pnl) / max) * 100 : 0} positive={r.pnl >= 0} />
          <span className="flex items-baseline justify-end gap-2">
            <Pnl value={r.pnl} className="text-[12px] font-semibold">
              {r.count ? fmtMoney(r.pnl, currency, { sign: true, compact: true }) : '—'}
            </Pnl>
            <span className="num w-5 text-right text-[10px] text-dim">{r.count || '·'}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function WeekStrip({ data, currency }: { data: GroupPerf[]; currency: Currency }) {
  const t = useT()
  const max = Math.max(...data.map((d) => Math.abs(d.pnl)), 1)
  return (
    <>
      <StripRows
        currency={currency}
        max={max}
        rows={data.map((d) => ({ key: d.key, label: weekdayShort(getAppLocale(), Number(d.key)), pnl: d.pnl, count: d.count }))}
      />
      <div className="hidden grid-cols-7 gap-2.5 sm:grid">
        {data.map((d, i) => (
          <div key={d.key} className="flex min-w-0 flex-col items-center">
            <StripBar pnl={d.pnl} count={d.count} max={max} height="h-40" delay={i * 40} />
            <div className="mt-2.5 text-[11px] font-semibold text-muted">{weekdayShort(getAppLocale(), Number(d.key))}</div>
            <Pnl value={d.pnl} className="mt-0.5 max-w-full truncate text-[12px] font-semibold">
              {d.count ? fmtMoney(d.pnl, currency, { sign: true, compact: true }) : '—'}
            </Pnl>
            <div className="num mt-0.5 max-w-full truncate text-[10px] text-dim">{d.count ? t('an.opsN', { n: d.count }) : '·'}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function PayoffBars({ avgWin, avgLoss, currency }: { avgWin: number; avgLoss: number; currency: Currency }) {
  const t = useT()
  const max = Math.max(avgWin, avgLoss, 1)
  return (
    <div className="flex flex-col justify-center gap-5">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{t('an.avgWin')}</span>
          <Pnl value={avgWin} className="text-[13px] font-semibold">
            {fmtMoney(avgWin, currency, { sign: true })}
          </Pnl>
        </div>
        <MagnitudeBar className="mt-2" pct={avgWin ? (avgWin / max) * 100 : 0} positive />
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{t('an.avgLoss')}</span>
          <Pnl value={-avgLoss} className="text-[13px] font-semibold">
            {fmtMoney(-avgLoss || 0, currency)}
          </Pnl>
        </div>
        <MagnitudeBar className="mt-2" pct={avgLoss ? (avgLoss / max) * 100 : 0} positive={false} />
      </div>
    </div>
  )
}

function RatingStrip({ groups, currency }: { groups: GroupPerf[]; currency: Currency }) {
  const max = Math.max(...groups.map((g) => Math.abs(g.pnl)), 1)
  const stars = [1, 2, 3, 4, 5].map((star) => {
    const g = groups.find((x) => x.key === String(star))
    return { star, pnl: g?.pnl ?? 0, count: g?.count ?? 0 }
  })
  const starLabel = (star: number) => (
    <span className="inline-flex items-center gap-1">
      <span className="num">{star}</span>
      <Star size={10} strokeWidth={1.75} fill="currentColor" className="text-amber" />
    </span>
  )
  return (
    <>
      <StripRows currency={currency} max={max} rows={stars.map((s) => ({ key: String(s.star), label: starLabel(s.star), pnl: s.pnl, count: s.count }))} />
      <div className="hidden grid-cols-5 gap-2.5 sm:grid">
        {stars.map((s, i) => (
          <div key={s.star} className="flex min-w-0 flex-col items-center">
            <StripBar pnl={s.pnl} count={s.count} max={max} height="h-32" delay={i * 40} />
            <div className="mt-2.5 text-[11px] font-semibold text-muted">{starLabel(s.star)}</div>
            <Pnl value={s.pnl} className="mt-0.5 max-w-full truncate text-[12px] font-semibold">
              {s.count ? fmtMoney(s.pnl, currency, { sign: true, compact: true }) : '—'}
            </Pnl>
            <div className="num mt-0.5 text-[10px] text-dim">{s.count || '·'}</div>
          </div>
        ))}
      </div>
    </>
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
