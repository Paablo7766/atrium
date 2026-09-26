import { useMemo, useRef, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { AlertTriangle, Sparkles, ArrowRight, Share2, Loader2 } from 'lucide-react'
import { useStore } from '@/store'
import { useTrades } from '@/hooks/useTrades'
import { useLiveQuotes } from '@/hooks/useLiveQuotes'
import { Topbar } from '@/components/Topbar'
import { AssetLogo } from '@/components/AssetLogo'
import { Button, Card, Confirm, Empty, Menu, Pnl, Ring, Segmented, Trend, DirectionGlyph, menuRowClass } from '@/components/ui'
import { FlowChart, DailyPnlChart, EquityChart, Sparkline } from '@/components/charts'
import { computeStats, dailyFlow, dailyPnl, equityCurve, groupPerformance, tradePnl, unrealizedPnl, sortByExit } from '@/lib/stats'
import { accountEquity, netCashflow } from '@/lib/capital'
import { looksLikeDemoDesk } from '@/lib/demo'
import { todayKey, dateKeyFromDate, fmtMoney, fmtNum, fmtPct, fmtDate, capitalize } from '@/lib/format'
import { deltaPct, equityBefore, filterByPreviousRange, filterByRange, filterCashflowsByPreviousRange, filterCashflowsByRange, priorEquity, previousRangeStart } from '@/lib/range'
import { cleanTicker } from '@/lib/ticker'
import type { Trade } from '@/types'
import { useT } from '@/lib/useI18n'
import { useGoToPage } from '@/lib/useGoToPage'
import { dateFnsLocale, rangeHint, rangeOptions } from '@/lib/i18n'

export function Dashboard() {
  const { isLoading: cloudLoading, error: cloudError, fromCloud } = useTrades()
  const trades = useStore((s) => s.trades)
  const cashflows = useStore((s) => s.cashflows)
  const settings = useStore((s) => s.settings)
  const goToPage = useGoToPage()
  const openTradeModal = useStore((s) => s.openTradeModal)
  const loadDemo = useStore((s) => s.loadDemo)
  const clearAll = useStore((s) => s.clearAll)
  const toast = useStore((s) => s.toast)
  const notes = useStore((s) => s.notes)

  const range = useStore((s) => s.statsRange)
  const setRange = useStore((s) => s.setStatsRange)
  const openShareCard = useStore((s) => s.openShareCard)
  const [chartMode, setChartMode] = useState<'flow' | 'equity' | 'daily'>('flow')
  const [confirmDemo, setConfirmDemo] = useState(false)
  const t = useT()
  const locale = settings.locale ?? 'es'

  const filtered = useMemo(() => filterByRange(trades, range), [trades, range])
  const previous = useMemo(() => filterByPreviousRange(trades, range), [trades, range])
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
  const prevStats = useMemo(() => computeStats(previous, prevBase, previousFlows), [previous, prevBase, previousFlows])
  const stats = useMemo(() => computeStats(filtered, baseEquity, rangeFlows), [filtered, baseEquity, rangeFlows])
  const curve = useMemo(() => equityCurve(filtered, baseEquity, rangeFlows), [filtered, baseEquity, rangeFlows])
  const flow = useMemo(() => dailyFlow(filtered, baseEquity, rangeFlows), [filtered, baseEquity, rangeFlows])
  const daily = useMemo(() => {
    const m = dailyPnl(filtered)
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, pnl: v.pnl, count: v.count }))
  }, [filtered])
  const strategyPerf = useMemo(() => groupPerformance(filtered, (tr) => tr.strategy || t('common.noStrategy')), [filtered, t])
  const byStrategy = strategyPerf.slice(0, 4)
  const moreStrategies = strategyPerf.length - byStrategy.length
  const strategyMax = Math.max(...byStrategy.map((x) => Math.abs(x.pnl)), 1)
  const recent = useMemo(() => {
    const open = filtered
      .filter((t) => t.status === 'OPEN')
      .sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime())
    const closed = sortByExit(filtered.filter((t) => t.status === 'CLOSED')).reverse()
    return [...open, ...closed].slice(0, 6)
  }, [filtered])
  const openCount = useMemo(() => filtered.filter((t) => t.status === 'OPEN').length, [filtered])
  const openPositions = useMemo(
    () =>
      trades
        .filter((t) => t.status === 'OPEN')
        .sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()),
    [trades],
  )
  const { quotes, isLoadingQuotes } = useLiveQuotes(trades)

  const equity = accountEquity(settings.startingBalance, trades, cashflows)
  const returnPct = baseEquity ? (stats.netPnl / baseEquity) * 100 : null

  const dayKey = todayKey()
  const todayAgg = useMemo(() => dailyPnl(trades).get(dayKey), [trades, dayKey])
  const lossLimitHit = settings.dailyLossLimit > 0 && !!todayAgg && todayAgg.pnl <= -settings.dailyLossLimit

  const last7 = useMemo(() => {
    const m = dailyPnl(trades)
    const out: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      out.push(m.get(dateKeyFromDate(d))?.pnl ?? 0)
    }
    return out
  }, [trades])
  const last7Total = useMemo(() => last7.reduce((a, b) => a + b, 0), [last7])

  const todayPnl = todayAgg?.pnl ?? 0
  const pfTrend = range === 'all' ? undefined : deltaPct(stats.profitFactor, prevStats.profitFactor)
  const demoDesk = !!settings.demoData || looksLikeDemoDesk(notes)

  const equitySeries = useMemo(
    () => [settings.startingBalance, ...equityCurve(trades, settings.startingBalance, cashflows).map((p) => p.equity)],
    [trades, settings.startingBalance, cashflows],
  )
  const contributed = settings.startingBalance + netCashflow(cashflows)
  const lifetimePnl = equity - contributed
  const lifetimePct = contributed > 0 ? (lifetimePnl / contributed) * 100 : null

  const hour = new Date().getHours()
  const greet = t(hour < 6 || hour >= 21 ? 'dash.greet.evening' : hour < 13 ? 'dash.greet.morning' : 'dash.greet.afternoon')
  const firstName = settings.traderName && settings.traderName !== 'Trader' ? settings.traderName.split(' ')[0] : ''
  const todayLong = capitalize(format(new Date(), locale === 'en' ? 'EEEE, MMMM d' : "EEEE, d 'de' MMMM", { locale: dateFnsLocale(locale) }))

  if (cloudLoading) {
    return (
      <>
        <Topbar title={t('dash.title')} subtitle={settings.accountName} />
        <div className="flex-1 grid-bg flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <Loader2 className="text-accent animate-spin" size={28} />
            <p className="text-sm text-muted">{t('common.loading')}</p>
          </div>
        </div>
      </>
    )
  }

  if (fromCloud && cloudError) {
    return (
      <>
        <Topbar title={t('dash.title')} subtitle={settings.accountName} />
        <div className="flex-1 grid-bg flex items-center justify-center p-8">
          <div className="card max-w-md w-full p-8 text-center animate-slide-up">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-loss/10 border border-loss/20 flex items-center justify-center mb-5">
              <AlertTriangle className="text-loss" size={22} />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">No se pudieron cargar las operaciones</h2>
            <p className="text-sm text-muted mt-2 leading-relaxed break-all">{cloudError}</p>
          </div>
        </div>
      </>
    )
  }

  if (!trades.length && !cashflows.length) {
    return (
      <>
        <Topbar title={t('dash.title')} subtitle={settings.accountName} />
        <div className="flex-1 grid-bg flex items-center justify-center p-8">
          <div className="card max-w-lg w-full p-8 text-center animate-slide-up">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
              <Sparkles className="text-accent" size={24} />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              {settings.traderName && settings.traderName !== 'Trader' ? t('dash.readyNamed', { name: settings.traderName.split(' ')[0] }) : t('dash.ready')}
            </h2>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              {notes.length
                ? t('dash.readyNotes', { n: notes.length, entries: notes.length === 1 ? t('dash.entry') : t('dash.entries') })
                : t('dash.readyEmpty', { account: settings.accountName })}
            </p>
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button variant="primary" size="lg" onClick={() => openTradeModal()}>
                {t('dash.firstTrade')}
              </Button>
              <Button variant="outline" size="lg" onClick={() => (notes.length ? setConfirmDemo(true) : loadDemo())}>
                {t('dash.loadDemo')}
              </Button>
            </div>
          </div>
        </div>
        <Confirm
          open={confirmDemo}
          onClose={() => setConfirmDemo(false)}
          onConfirm={() => {
            loadDemo()
            toast(t('dash.demoLoaded'), 'info')
          }}
          title={t('dash.demoTitle')}
          message={t('dash.demoMsg', { n: notes.length, entries: notes.length === 1 ? t('dash.entry') : t('dash.entries'), account: settings.accountName })}
          confirmLabel={t('dash.replaceNotes')}
        />
      </>
    )
  }

  return (
    <>
      <Topbar title={t('dash.title')} subtitle={settings.accountName} />

      <div className="page">
        <header className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap animate-fade-up">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim">{todayLong}</div>
            <h2 className="display mt-2.5">
              {greet}
              {firstName && <span className="text-muted">, {firstName}</span>}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ShareMenu
              onWeek={() => openShareCard({ kind: 'week', start: todayKey() })}
              onMonth={() => openShareCard({ kind: 'month', month: todayKey().slice(0, 7) })}
            />
            <Segmented size="sm" value={range} onChange={setRange} options={rangeOptions(locale)} />
          </div>
        </header>

        {demoDesk && (trades.length > 0 || notes.length > 0) && (
          <Notice
            tone="neutral"
            icon={<Sparkles size={14} />}
            title={t('dash.demoBanner')}
            body={t('dash.demoBannerBody')}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearAll()
                  toast(t('dash.deskCleared'), 'success')
                }}
              >
                {t('dash.clearDesk')}
              </Button>
            }
          />
        )}
        {lossLimitHit && (
          <Notice
            tone="loss"
            icon={<AlertTriangle size={14} />}
            title={t('dash.lossHit')}
            body={t('dash.lossHitBody', { pnl: fmtMoney(todayAgg!.pnl, settings.currency, { sign: true }), limit: fmtMoney(-settings.dailyLossLimit, settings.currency) })}
            action={
              <Button variant="outline" size="sm" onClick={() => goToPage('journal')}>
                {t('dash.goJournal')}
              </Button>
            }
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
          <section className="card card-hover relative overflow-hidden flex flex-col lg:col-span-8 min-h-[236px] animate-fade-up delay-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            <div
              className="pointer-events-none absolute left-1/2 -top-40 -ml-[340px] w-[680px] h-[320px] rounded-full"
              style={{ background: 'radial-gradient(closest-side, rgba(228,228,235,0.07), transparent 75%)' }}
            />
            <div className="relative px-7 pt-6 grid grid-cols-1 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-6 sm:gap-10">
              <div className="min-w-0" title={t('dash.equityHint')}>
                <KpiLabel>{t('dash.equity')}</KpiLabel>
                <div className="num text-[46px] font-semibold tracking-[-0.045em] leading-none mt-4 text-gradient">
                  {fmtMoney(equity, settings.currency)}
                </div>
                <div className="flex items-center gap-2 mt-3.5 text-[12px]">
                  <DeltaPill value={lifetimePct} />
                  <span className="text-dim">{t('dash.sinceStart')}</span>
                </div>
              </div>
              <div className="min-w-0 sm:border-l sm:border-white/[0.06] sm:pl-10">
                <KpiLabel>P&L · {rangeHint(locale, range)}</KpiLabel>
                <Pnl value={stats.netPnl} className="text-[30px] font-semibold tracking-[-0.04em] leading-none mt-4 block">
                  {fmtMoney(stats.netPnl, settings.currency, { sign: true })}
                </Pnl>
                <div className="flex items-center gap-2 mt-3.5 text-[12px]">
                  <DeltaPill value={returnPct} />
                  <span className="text-dim truncate">{t('dash.opsDays', { ops: stats.total, days: stats.tradingDays })}</span>
                </div>
              </div>
            </div>
            <div className="relative mt-auto pt-5 -mb-px">
              <Sparkline data={equitySeries} positive={lifetimePnl >= 0} height={72} />
            </div>
          </section>

          <section className="card card-hover relative overflow-hidden flex flex-col lg:col-span-4 px-6 pt-6 pb-6 animate-fade-up delay-2">
            <KpiLabel>{t('dash.winRate')}</KpiLabel>
            <div className="flex items-center gap-5 mt-5">
              <Ring value={stats.winRate} size={84} stroke={5} track="rgba(255,255,255,0.06)">
                <span className="num text-[18px] font-semibold tracking-tight">
                  {fmtNum(stats.winRate, 0)}
                  <span className="text-[11px] text-muted">%</span>
                </span>
              </Ring>
              <div className="flex flex-col gap-2 text-[12px] min-w-0">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="num font-semibold text-text">{stats.wins}</span>
                  <span className="text-muted truncate">{t('dash.winsLabel')}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-loss" />
                  <span className="num font-semibold text-text">{stats.losses}</span>
                  <span className="text-muted truncate">{t('dash.lossesLabel')}</span>
                </span>
              </div>
            </div>
            <div className="mt-auto pt-5 border-t border-white/[0.06] flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim truncate">{t('dash.profitFactor')}</div>
                <div className="num text-[20px] font-semibold tracking-tight mt-1.5 leading-none">
                  {stats.profitFactor === Infinity ? '∞' : fmtNum(stats.profitFactor, 2)}
                </div>
              </div>
              {pfTrend !== undefined && <Trend value={pfTrend} />}
            </div>
          </section>
        </div>

        <section className="card overflow-hidden animate-fade-up delay-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.05]">
            <StripStat
              label={t('dash.today')}
              value={<Pnl value={todayPnl}>{fmtMoney(todayPnl, settings.currency, { sign: true })}</Pnl>}
              hint={todayAgg ? t('dash.opsN', { n: todayAgg.count }) : undefined}
            />
            <StripStat
              label={t('dash.7d')}
              value={<Pnl value={last7Total}>{fmtMoney(last7Total, settings.currency, { sign: true })}</Pnl>}
              aside={<MiniBars values={last7} />}
            />
            <StripStat
              label={t('stats.bestDay')}
              value={
                stats.bestDay ? <Pnl value={stats.bestDay.pnl}>{fmtMoney(stats.bestDay.pnl, settings.currency, { sign: true })}</Pnl> : '—'
              }
              hint={stats.bestDay ? fmtDate(`${stats.bestDay.date}T12:00:00`, 'd MMM') : undefined}
            />
            <StripStat
              label={t('dash.maxDd')}
              value={
                stats.maxDrawdown ? (
                  <span className="text-loss">−{fmtMoney(stats.maxDrawdown, settings.currency)}</span>
                ) : (
                  fmtMoney(0, settings.currency)
                )
              }
              hint={stats.maxDrawdown ? `${fmtNum(stats.maxDrawdownPct, 1)}%` : undefined}
            />
          </div>
        </section>

        <Card
          className="animate-fade-up delay-4"
          title={chartMode === 'daily' ? t('dash.chartDaily') : chartMode === 'equity' ? t('dash.chartEquity') : t('dash.chartFlow')}
          action={
            <Segmented
              size="sm"
              value={chartMode}
              onChange={setChartMode}
              options={[
                { value: 'flow', label: t('dash.flow') },
                { value: 'equity', label: 'Equity' },
                { value: 'daily', label: t('dash.daily') },
              ]}
            />
          }
        >
          {flow.length || curve.length ? (
            chartMode === 'daily' ? (
              <DailyPnlChart data={daily} currency={settings.currency} height={320} />
            ) : chartMode === 'equity' ? (
              <EquityChart data={curve} currency={settings.currency} mode="equity" height={320} />
            ) : (
              <FlowChart data={flow} currency={settings.currency} height={320} />
            )
          ) : (
            <Empty title={t('dash.emptyClosed')} description={t('dash.emptyClosedHint')} />
          )}
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] gap-4 lg:gap-5 items-start">
          <Card
            title={<span className="tracking-normal">{t('dash.recent')}</span>}
            subtitle={openCount ? t('dash.openCount', { n: openCount }) : undefined}
            action={
              <Button variant="ghost" size="sm" onClick={() => goToPage('trades')}>
                {t('dash.seeAll')} <ArrowRight size={14} />
              </Button>
            }
            padded={false}
            className="overflow-hidden"
          >
            {recent.length ? (
              <>
                <div className={clsx(RECENT_GRID, 'border-t border-border bg-surface-2/40 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-dim')}>
                  <span className="truncate">{t('dash.colDate')}</span>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 shrink-0" aria-hidden />
                    <span className="w-[22px] shrink-0" aria-hidden />
                    <span className="truncate">{t('dash.openColSymbol')}</span>
                  </span>
                  <span className="truncate">{t('dash.colStrategy')}</span>
                  <span className="text-right truncate">{t('dash.openColPnl')}</span>
                </div>
                <ul>
                  {recent.map((tr) => (
                    <li key={tr.id} className="border-t border-border/70">
                      <RecentRow
                        t={tr}
                        livePrice={tr.status === 'OPEN' ? quotes[cleanTicker(tr.symbol)] : undefined}
                        onClick={() => openTradeModal(tr)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Empty title={t('dash.emptyPeriod')} description={t('dash.emptyPeriodHint')} />
            )}
          </Card>

          <div className="flex flex-col gap-4 lg:gap-5 min-w-0">
            {openPositions.length > 0 && (
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <span className="relative flex w-1.5 h-1.5">
                      <span className="absolute inset-0 rounded-full bg-sky animate-ping-soft" />
                      <span className="relative w-1.5 h-1.5 rounded-full bg-sky" />
                    </span>
                    <span className="tracking-normal">{t('dash.openPositions')}</span>
                  </span>
                }
                subtitle={isLoadingQuotes ? t('dash.openUpdating') : undefined}
                action={
                  isLoadingQuotes ? (
                    <Loader2 size={14} className="text-muted animate-spin mt-1" />
                  ) : (
                    <span className="num text-[11px] font-semibold text-muted bg-surface-3 border border-border-2 rounded-md px-1.5 py-0.5">
                      {openPositions.length}
                    </span>
                  )
                }
                padded={false}
                className="overflow-hidden"
              >
                <ul>
                  {openPositions.map((tr) => (
                    <li key={tr.id} className="border-t border-border/70">
                      <OpenPositionRow trade={tr} livePrice={quotes[cleanTicker(tr.symbol)]} onClick={() => openTradeModal(tr)} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card
              title={<span className="tracking-normal">{t('dash.strategies')}</span>}
              action={
                <Button variant="ghost" size="sm" onClick={() => goToPage('analytics')}>
                  {t('nav.analytics')} <ArrowRight size={14} />
                </Button>
              }
              padded={false}
              className="overflow-hidden"
            >
              {byStrategy.length ? (
                <div className="border-t border-border">
                  <ol>
                    {byStrategy.map((g, i) => (
                      <li key={g.key} className="px-5 sm:px-6 py-3.5 border-t border-border/70 first:border-t-0">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="num w-6 pt-0.5 text-[11px] font-semibold text-dim shrink-0">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3 min-w-0">
                              <span className="min-w-0 truncate text-[13px] font-medium">{g.key}</span>
                              <Pnl value={g.pnl} className="font-semibold text-[13px] shrink-0">
                                {fmtMoney(g.pnl, settings.currency, { sign: true })}
                              </Pnl>
                            </div>
                            <div className="mt-1 text-[11px] text-dim num">
                              {fmtNum(g.winRate, 0)}% · {t('dash.opsN', { n: g.count })}
                            </div>
                            <div className="mt-2 h-1 rounded-full bg-surface-3 overflow-hidden">
                              <div
                                className={clsx('h-full rounded-full', g.pnl >= 0 ? 'bg-accent' : 'bg-loss')}
                                style={{ width: `${Math.max(6, (Math.abs(g.pnl) / strategyMax) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {moreStrategies > 0 && (
                    <button
                      type="button"
                      onClick={() => goToPage('analytics')}
                      className="w-full px-6 py-3 border-t border-border/70 text-left text-[12px] text-muted hover:text-text hover:bg-surface-2 transition-colors"
                    >
                      {t('dash.moreN', { n: moreStrategies })}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-dim px-6 py-8 border-t border-border">{t('dash.noStrategyRank')}</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}

const RECENT_GRID =
  'grid grid-cols-[5.25rem_minmax(0,1.25fr)_minmax(0,1fr)_minmax(5rem,6.5rem)] items-center gap-x-3 sm:gap-x-5 px-5 sm:px-6'

function KpiLabel({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted truncate">{children}</div>
}

function ShareMenu({ onWeek, onMonth }: { onWeek: () => void; onMonth: () => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const pick = (fn: () => void) => {
    setOpen(false)
    fn()
  }
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border text-[12px] font-medium transition-colors',
          open ? 'border-border-3 bg-surface-3 text-text' : 'border-border bg-surface-2 text-muted hover:text-text hover:border-border-2',
        )}
      >
        <Share2 size={12} /> {t('dash.share')}
      </button>
      <Menu open={open} onClose={() => setOpen(false)} anchorRef={anchor}>
        <button type="button" className={menuRowClass(false)} onClick={() => pick(onWeek)}>
          {t('dash.shareWeek')}
        </button>
        <button type="button" className={menuRowClass(false)} onClick={() => pick(onMonth)}>
          {t('dash.shareMonth')}
        </button>
      </Menu>
    </>
  )
}

function DeltaPill({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-dim">—</span>
  const up = value >= 0
  return (
    <span
      className={clsx(
        'num inline-flex items-center h-5 px-1.5 rounded-md text-[11px] font-semibold border',
        up ? 'text-accent bg-accent/10 border-accent/20' : 'text-loss bg-loss/10 border-loss/20',
      )}
    >
      {fmtPct(value, 1, { sign: true })}
    </span>
  )
}

function StripStat({ label, value, hint, aside }: { label: string; value: ReactNode; hint?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="bg-surface px-5 py-4 min-w-0 hover:bg-surface-2/70 transition-colors">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim truncate">{label}</div>
      <div className="flex items-end justify-between gap-2 mt-2.5">
        <div className="num text-[17px] font-semibold tracking-tight leading-none text-text truncate">{value}</div>
        {aside}
      </div>
      <div className="text-[11px] text-dim mt-2 leading-none h-3 truncate">{hint}</div>
    </div>
  )
}

function Notice({
  tone,
  icon,
  title,
  body,
  action,
}: {
  tone: 'neutral' | 'loss'
  icon: ReactNode
  title: string
  body: string
  action: ReactNode
}) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden flex items-center gap-3 rounded-2xl border pl-4 pr-3 py-2.5 text-[13px] animate-fade-up',
        tone === 'neutral' ? 'border-white/[0.08] bg-white/[0.025]' : 'border-loss/25 bg-loss/[0.07]',
      )}
    >
      <span
        className={clsx(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
          tone === 'neutral' ? 'bg-white/[0.06] text-text-2' : 'bg-loss/15 text-loss',
        )}
      >
        {icon}
      </span>
      <div className="flex-1 leading-relaxed min-w-0">
        <span className={clsx('font-semibold', tone === 'neutral' ? 'text-text' : 'text-loss')}>{title}</span>{' '}
        <span className="text-muted">{body}</span>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values.map(Math.abs), 1)
  return (
    <div className="flex items-end gap-[3px] h-5 shrink-0">
      {values.map((v, i) => {
        const last = i === values.length - 1
        const pos = v >= 0
        return (
          <div
            key={i}
            className={clsx('w-1 rounded-[1px]', pos ? (last ? 'bg-accent' : 'bg-accent/40') : last ? 'bg-loss' : 'bg-loss/55')}
            style={{ height: v === 0 ? '10%' : `${Math.max(18, (Math.abs(v) / max) * 100)}%` }}
          />
        )
      })}
    </div>
  )
}

function OpenPositionRow({
  trade,
  livePrice,
  onClick,
}: {
  trade: Trade
  livePrice: number | undefined
  onClick: () => void
}) {
  const settings = useStore((s) => s.settings)
  const tx = useT()
  const hasQuote = livePrice !== undefined && Number.isFinite(livePrice)
  const pnl = hasQuote ? unrealizedPnl(trade, livePrice) : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-surface-2 transition-colors"
    >
      <span className="w-6 shrink-0 flex justify-center">
        <DirectionGlyph direction={trade.direction} />
      </span>
      <AssetLogo ticker={trade.symbol} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold mono text-[13px] tracking-tight truncate leading-none">{trade.symbol}</div>
        <div className="flex items-center gap-1.5 num text-[11px] text-dim mt-1.5 leading-none min-w-0">
          <span className="shrink-0">{tx('dash.openColEntry')}</span>
          <span className="truncate">{fmtNum(trade.entryPrice, 2)}</span>
          {hasQuote && <span className="text-muted truncate">→ {fmtNum(livePrice, 2)}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        {pnl !== null ? (
          <Pnl value={pnl} className="font-semibold text-[13px] tracking-tight">
            {fmtMoney(pnl, settings.currency, { sign: true })}
          </Pnl>
        ) : (
          <span className="text-[11px] font-medium text-sky whitespace-nowrap">{tx('dash.openNoQuote')}</span>
        )}
      </div>
    </button>
  )
}

function RecentRow({
  t,
  livePrice,
  onClick,
}: {
  t: Trade
  livePrice?: number
  onClick: () => void
}) {
  const settings = useStore((s) => s.settings)
  const tx = useT()
  const open = t.status === 'OPEN'
  const hasQuote = open && livePrice !== undefined && Number.isFinite(livePrice)
  const pnl = open ? (hasQuote ? unrealizedPnl(t, livePrice) : null) : tradePnl(t)
  const when = t.exitDate ?? t.entryDate
  const rail =
    open && pnl === null
      ? 'bg-sky'
      : pnl !== null && pnl > 0
        ? 'bg-accent'
        : pnl !== null && pnl < 0
          ? 'bg-loss'
          : open
            ? 'bg-sky'
            : 'bg-border-3'

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(RECENT_GRID, 'group relative w-full py-3 text-left hover:bg-surface-2 transition-colors')}
    >
      <span className={clsx('absolute left-0 top-3 bottom-3 w-[2px] rounded-full opacity-70 group-hover:opacity-100 transition-opacity', rail)} />

      <div className="min-w-0">
        <div className="text-[13px] font-medium tracking-tight leading-none">{fmtDate(when, 'd MMM')}</div>
        <div className="num text-[11px] text-dim mt-1.5 leading-none">{fmtDate(when, 'HH:mm')}</div>
      </div>

      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-6 shrink-0 flex justify-center">
          <DirectionGlyph direction={t.direction} />
        </span>
        <AssetLogo ticker={t.symbol} size="sm" />
        <span className="font-semibold mono text-[13px] tracking-tight truncate">{t.symbol}</span>
      </div>

      <div className="min-w-0">
        {t.strategy ? (
          <span className="inline-flex max-w-full items-center h-6 px-2 rounded-md bg-surface-3/70 border border-border text-[11px] font-medium text-text-2 truncate">
            {t.strategy}
          </span>
        ) : (
          <span className="text-[12px] text-dim">—</span>
        )}
      </div>

      <div className="text-right min-w-0">
        {open && pnl === null ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky">
            <span className="w-1.5 h-1.5 rounded-full bg-sky" />
            {tx('common.inProgress')}
          </span>
        ) : pnl !== null ? (
          <Pnl value={pnl} className="font-semibold text-[13px] tracking-tight">
            {fmtMoney(pnl, settings.currency, { sign: true })}
          </Pnl>
        ) : null}
      </div>
    </button>
  )
}
