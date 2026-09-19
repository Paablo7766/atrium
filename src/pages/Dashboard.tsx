import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { AlertTriangle, Sparkles, ArrowRight, Share2, Loader2 } from 'lucide-react'
import { useStore } from '@/store'
import { useTrades } from '@/hooks/useTrades'
import { Topbar } from '@/components/Topbar'
import { AssetLogo } from '@/components/AssetLogo'
import { Button, Card, Confirm, Empty, Pnl, Segmented, Stat, StatGrid, DirectionGlyph } from '@/components/ui'
import { PeriodStats } from '@/components/PeriodStats'
import { FlowChart, DailyPnlChart, EquityChart } from '@/components/charts'
import { computeStats, dailyFlow, dailyPnl, equityCurve, groupPerformance, tradePnl, sortByExit } from '@/lib/stats'
import { accountEquity } from '@/lib/capital'
import { looksLikeDemoDesk } from '@/lib/demo'
import { todayKey, dateKeyFromDate, fmtMoney, fmtNum, fmtPct, fmtDate } from '@/lib/format'
import { deltaPct, equityBefore, filterByPreviousRange, filterByRange, filterCashflowsByPreviousRange, filterCashflowsByRange, priorEquity, previousRangeStart } from '@/lib/range'
import type { Trade } from '@/types'
import { useT } from '@/lib/useI18n'
import { rangeHint, rangeOptions } from '@/lib/i18n'

export function Dashboard() {
  const { isLoading: cloudLoading, error: cloudError, fromCloud } = useTrades()
  const trades = useStore((s) => s.trades)
  const cashflows = useStore((s) => s.cashflows)
  const settings = useStore((s) => s.settings)
  const setPage = useStore((s) => s.setPage)
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
  const byStrategy = strategyPerf.slice(0, 5)
  const moreStrategies = strategyPerf.length - byStrategy.length
  const strategyMax = Math.max(...byStrategy.map((x) => Math.abs(x.pnl)), 1)
  const recent = useMemo(() => {
    const open = filtered
      .filter((t) => t.status === 'OPEN')
      .sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime())
    const closed = sortByExit(filtered.filter((t) => t.status === 'CLOSED')).reverse()
    return [...open, ...closed].slice(0, 7)
  }, [filtered])
  const openCount = useMemo(() => filtered.filter((t) => t.status === 'OPEN').length, [filtered])

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

      <div className="page animate-fade-in">
        {demoDesk && (trades.length > 0 || notes.length > 0) && (
          <div className="flex items-center gap-3 rounded-2xl border border-violet/25 bg-violet/10 px-5 py-3.5 text-sm">
            <Sparkles size={16} className="text-violet shrink-0" />
            <div className="flex-1 leading-relaxed min-w-0">
              <span className="font-semibold text-text">{t('dash.demoBanner')}</span>{' '}
              <span className="text-text-2">{t('dash.demoBannerBody')}</span>
            </div>
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
          </div>
        )}
        {lossLimitHit && (
          <div className="flex items-center gap-3 rounded-2xl border border-loss/30 bg-loss/10 px-5 py-4 text-sm">
            <AlertTriangle size={16} className="text-loss shrink-0" />
            <div className="flex-1 leading-relaxed">
              <span className="font-semibold text-loss">{t('dash.lossHit')}</span>{' '}
              <span className="text-text-2">
                {t('dash.lossHitBody', { pnl: fmtMoney(todayAgg!.pnl, settings.currency, { sign: true }), limit: fmtMoney(-settings.dailyLossLimit, settings.currency) })}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPage('journal')}>
              {t('dash.goJournal')}
            </Button>
          </div>
        )}

        <section className="relative overflow-hidden card px-7 py-6 lg:px-8 lg:py-7">
          <div
            className={clsx(
              'pointer-events-none absolute -top-28 -right-16 w-[26rem] h-[26rem] rounded-full blur-3xl opacity-90',
              stats.netPnl >= 0 ? 'bg-accent/10' : 'bg-loss/10',
            )}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="relative">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-7">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{t('dash.metricsPeriod')}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                title={t('dash.shareWeek')}
                onClick={() => openShareCard({ kind: 'week', start: todayKey() })}
              >
                <Share2 size={14} /> {t('common.week')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title={t('dash.shareMonth')}
                onClick={() => openShareCard({ kind: 'month', month: todayKey().slice(0, 7) })}
              >
                <Share2 size={14} /> {t('common.month')}
              </Button>
              <Segmented size="sm" value={range} onChange={setRange} options={rangeOptions(locale)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 lg:gap-16">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{t('dash.equity')}</div>
              <div className="num text-[40px] font-semibold tracking-tight leading-none mt-3 text-gradient">
                {fmtMoney(equity, settings.currency)}
              </div>
              <p className="text-[13px] text-dim mt-3 leading-relaxed max-w-md">{t('dash.equityHint')}</p>
            </div>
            <div className="min-w-0 md:border-l md:border-border md:pl-12 lg:pl-16">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t('dash.periodPnl', { hint: rangeHint(locale, range) })}</div>
              <Pnl value={stats.netPnl} className="text-[32px] font-semibold tracking-tight leading-none mt-3 block">
                {fmtMoney(stats.netPnl, settings.currency, { sign: true })}
              </Pnl>
              <div className="text-[13px] mt-3 text-muted leading-relaxed">
                {returnPct !== null ? (
                  <span className={clsx(returnPct >= 0 ? 'text-accent' : 'text-loss')}>{fmtPct(returnPct, 1, { sign: true })}</span>
                ) : (
                  <span className="text-dim">—</span>
                )}
                <span className="text-dim">
                  {' '}
                  {t('dash.periodMeta', { ops: stats.total, days: stats.tradingDays })}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-7 border-t border-border">
            <StatGrid>
              <Stat
                boxed
                label={t('dash.today')}
                value={<Pnl value={todayPnl}>{fmtMoney(todayPnl, settings.currency, { sign: true })}</Pnl>}
              />
              <Stat
                boxed
                label={t('dash.7d')}
                value={
                  <span className="flex items-center gap-3">
                    <Pnl value={last7Total}>{fmtMoney(last7Total, settings.currency, { sign: true })}</Pnl>
                    <MiniBars values={last7} />
                  </span>
                }
              />
              <Stat
                boxed
                label={t('dash.winRate')}
                value={`${fmtNum(stats.winRate, 0)}%`}
                hint={
                  <span>
                    <span className="text-accent">{stats.wins}W</span>
                    <span className="text-dim"> / </span>
                    <span className="text-loss">{stats.losses}L</span>
                  </span>
                }
              />
              <Stat
                boxed
                label={t('dash.profitFactor')}
                value={stats.profitFactor === Infinity ? '∞' : fmtNum(stats.profitFactor, 2)}
                trend={pfTrend}
              />
              <Stat
                boxed
                label={t('stats.bestDay')}
                value={
                  stats.bestDay ? (
                    <Pnl value={stats.bestDay.pnl}>{fmtMoney(stats.bestDay.pnl, settings.currency, { sign: true })}</Pnl>
                  ) : (
                    '—'
                  )
                }
                hint={stats.bestDay ? fmtDate(`${stats.bestDay.date}T12:00:00`, 'd MMM') : undefined}
              />
              <Stat
                boxed
                label={t('dash.maxDd')}
                value={stats.maxDrawdown ? `−${fmtMoney(stats.maxDrawdown, settings.currency)}` : fmtMoney(0, settings.currency)}
                hint={stats.maxDrawdown ? `${fmtNum(stats.maxDrawdownPct, 1)}%` : undefined}
              />
              <PeriodStats boxed stats={stats} />
            </StatGrid>
          </div>
          </div>
        </section>

        <Card
          title={chartMode === 'daily' ? t('dash.chartDaily') : chartMode === 'equity' ? t('dash.chartEquity') : t('dash.chartFlow')}
          subtitle={
            chartMode === 'daily'
              ? t('dash.chartDailySub')
              : chartMode === 'equity'
                ? range === 'all'
                  ? t('dash.chartEquityAll')
                  : t('dash.chartEquityRange')
                : range === 'all'
                  ? t('dash.chartFlowAll')
                  : t('dash.chartFlowRange')
          }
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
              <DailyPnlChart data={daily} currency={settings.currency} height={300} />
            ) : chartMode === 'equity' ? (
              <EquityChart data={curve} currency={settings.currency} mode="equity" height={300} />
            ) : (
              <FlowChart data={flow} currency={settings.currency} height={300} />
            )
          ) : (
            <Empty title={t('dash.emptyClosed')} description={t('dash.emptyClosedHint')} />
          )}
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 lg:gap-6">
          <Card
            title={t('dash.recent')}
            subtitle={openCount ? t('dash.openCount', { n: openCount }) : rangeHint(locale, range)}
            action={
              <Button variant="ghost" size="sm" onClick={() => setPage('trades')}>
                {t('dash.seeAll')} <ArrowRight size={14} />
              </Button>
            }
            padded={false}
            className="overflow-hidden"
          >
            {recent.length ? (
              <ul>
                {recent.map((t) => (
                  <li key={t.id} className="border-t border-border">
                    <RecentRow t={t} onClick={() => openTradeModal(t)} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title={t('dash.emptyPeriod')} description={t('dash.emptyPeriodHint')} />
            )}
          </Card>

          <Card
            title={t('dash.strategies')}
            subtitle={rangeHint(locale, range)}
            action={
              <Button variant="ghost" size="sm" onClick={() => setPage('analytics')}>
                {t('nav.analytics')} <ArrowRight size={14} />
              </Button>
            }
            padded={false}
            className="overflow-hidden"
          >
            {byStrategy.length ? (
              <div className="border-t border-border px-5 py-4">
                <div className="flex flex-col gap-4">
                  {byStrategy.map((g) => (
                    <div key={g.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 text-[13px] font-medium truncate">{g.key}</span>
                        <Pnl value={g.pnl} className="font-semibold text-[13px] shrink-0">
                          {fmtMoney(g.pnl, settings.currency, { sign: true })}
                        </Pnl>
                      </div>
                      <div className="mt-2 h-[3px] rounded-full bg-surface-3 overflow-hidden">
                        <div
                          className={clsx('h-full rounded-full', g.pnl >= 0 ? 'bg-accent' : 'bg-loss')}
                          style={{ width: `${Math.max(6, (Math.abs(g.pnl) / strategyMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {moreStrategies > 0 && (
                  <button
                    type="button"
                    onClick={() => setPage('analytics')}
                    className="mt-4 text-[12px] text-muted hover:text-text transition-colors"
                  >
                    {t('dash.moreN', { n: moreStrategies })}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-dim px-5 py-8 border-t border-border">
                {t('dash.noStrategyRank')}
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values.map(Math.abs), 1)
  return (
    <div className="flex items-end gap-[3px] h-6 mb-0.5">
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

function RecentRow({ t, onClick }: { t: Trade; onClick: () => void }) {
  const settings = useStore((s) => s.settings)
  const tx = useT()
  const pnl = tradePnl(t)
  const open = t.status === 'OPEN'
  const when = t.exitDate ?? t.entryDate
  const rail = open ? 'bg-sky' : pnl > 0 ? 'bg-accent' : pnl < 0 ? 'bg-loss' : 'bg-border-3'

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full grid grid-cols-[4.25rem_minmax(0,1.2fr)_minmax(0,1fr)_6.75rem] items-center gap-x-4 px-5 py-3 text-left hover:bg-surface-2 transition-colors"
    >
      <span className={clsx('absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full', rail)} />

      <div className="min-w-0">
        <div className="text-[13px] font-medium tracking-tight leading-none">{fmtDate(when, 'd MMM')}</div>
        <div className="num text-[11px] text-dim mt-1 leading-none">{fmtDate(when, 'HH:mm')}</div>
      </div>

      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-6 shrink-0 flex justify-center">
          <DirectionGlyph direction={t.direction} />
        </span>
        <AssetLogo ticker={t.symbol} size="sm" />
        <span className="font-semibold mono text-[13px] tracking-tight truncate">{t.symbol}</span>
      </div>

      <div className="text-[12px] text-muted truncate">{t.strategy || '—'}</div>

      <div className="text-right min-w-0">
        {open ? (
          <span className="text-[12px] font-medium text-sky">{tx('common.inProgress')}</span>
        ) : (
          <Pnl value={pnl} className="font-semibold text-[13px] tracking-tight">
            {fmtMoney(pnl, settings.currency, { sign: true })}
          </Pnl>
        )}
      </div>
    </button>
  )
}
