import { Fragment, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getWeek,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { dateFnsLocale, getAppLocale, weekdayShort } from '@/lib/i18n'
import { useT, useLocale } from '@/lib/useI18n'
import { CalendarDays, ChevronLeft, ChevronRight, NotebookPen, PanelRightClose, PanelRightOpen, Plus, Share2 } from 'lucide-react'
import { useStore } from '@/store'
import { useGoToPage } from '@/lib/useGoToPage'
import { Topbar } from '@/components/Topbar'
import { AssetLogo } from '@/components/AssetLogo'
import { AnalyticsCard, Detail, Kicker, SCROLL_X } from '@/components/analytics'
import { Button, Card, DirectionGlyph, Empty, Pnl, Segmented } from '@/components/ui'
import { dailyPnl, tradePnl, type DayAgg } from '@/lib/stats'
import { capitalize, fmtDate, fmtMoney } from '@/lib/format'

export function Calendar() {
  const t = useT()
  const locale = useLocale()
  const trades = useStore((s) => s.trades)
  const notes = useStore((s) => s.notes)
  const settings = useStore((s) => s.settings)
  const openTradeModal = useStore((s) => s.openTradeModal)
  const openShareCard = useStore((s) => s.openShareCard)
  const toast = useStore((s) => s.toast)
  const goToPage = useGoToPage()

  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [tab, setTab] = useState<'pnl' | 'events'>('pnl')
  const [selected, setSelectedRaw] = useState<string | null>(() => format(new Date(), 'yyyy-MM-dd'))
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem('atrium.cal.dayPanel') !== '0'
    } catch {
      return true
    }
  })
  const panelRef = useRef<HTMLDivElement>(null)
  const setPanelOpenPersist = (open: boolean) => {
    setPanelOpen(open)
    try {
      localStorage.setItem('atrium.cal.dayPanel', open ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  const setSelected = (key: string | null) => {
    setSelectedRaw(key)
    if (key) {
      setPanelOpenPersist(true)
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    }
  }

  const daily = useMemo(() => dailyPnl(trades), [trades])
  const notesByDay = useMemo(() => {
    const m = new Map<string, typeof notes>()
    for (const n of notes) {
      const list = m.get(n.date) ?? []
      list.push(n)
      m.set(n.date, list)
    }
    return m
  }, [notes])

  const weekStartsOn = settings.weekStartsOn === 0 ? 0 : 1
  const weekdays = (weekStartsOn === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]).map((d) => weekdayShort(locale, d))

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn })
    return eachDayOfInterval({ start, end })
  }, [month, weekStartsOn])

  const weeks = useMemo(() => {
    const rows: Date[][] = []
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7))
    return rows
  }, [days])

  const inMonthDays = useMemo(() => days.filter((d) => isSameMonth(d, month)), [days, month])

  const monthAgg = useMemo(() => {
    let pnl = 0
    let count = 0
    let wins = 0
    let losses = 0
    let greenDays = 0
    let redDays = 0
    let tradingDays = 0
    let best = { pnl: -Infinity, key: '' }
    let worst = { pnl: Infinity, key: '' }
    for (const d of inMonthDays) {
      const key = format(d, 'yyyy-MM-dd')
      const a = daily.get(key)
      if (!a) continue
      pnl += a.pnl
      count += a.count
      wins += a.wins
      losses += a.losses
      tradingDays++
      if (a.pnl > 0) greenDays++
      if (a.pnl < 0) redDays++
      if (a.pnl > best.pnl) best = { pnl: a.pnl, key }
      if (a.pnl < worst.pnl) worst = { pnl: a.pnl, key }
    }
    return {
      pnl,
      count,
      wins,
      losses,
      greenDays,
      redDays,
      tradingDays,
      winRate: wins + losses ? (wins / (wins + losses)) * 100 : 0,
      best: best.key ? best : null,
      worst: worst.key ? worst : null,
    }
  }, [inMonthDays, daily])

  const weekTotals = useMemo(
    () =>
      weeks.map((week) => {
        let pnl = 0
        let count = 0
        for (const d of week) {
          if (!isSameMonth(d, month)) continue
          const a = daily.get(format(d, 'yyyy-MM-dd'))
          if (!a) continue
          pnl += a.pnl
          count += a.count
        }
        return { pnl, count, week: getWeek(week[3] ?? week[0], { weekStartsOn, firstWeekContainsDate: weekStartsOn === 0 ? 1 : 4 }) }
      }),
    [weeks, month, daily],
  )

  const selectedAgg = selected ? daily.get(selected) : undefined
  const selectedNotes = selected ? notesByDay.get(selected) : undefined
  const viewingCurrentMonth = isSameMonth(month, new Date())

  const goToday = () => {
    const now = new Date()
    setMonth(startOfMonth(now))
    setSelected(format(now, 'yyyy-MM-dd'))
  }

  return (
    <>
      <Topbar title={t('cal.title')} subtitle={tab === 'pnl' ? t('cal.pnlTab') : t('nav.journal')} />

      <div className="page-stage max-lg:overflow-y-auto">
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          <Card padded={false} className="flex flex-col min-h-0 overflow-hidden flex-1 min-w-0">
            <div className="relative flex flex-col h-full min-h-0">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            <div
              className="pointer-events-none absolute left-1/2 -top-40 -ml-[340px] h-[320px] w-[680px] rounded-full"
              style={{ background: 'radial-gradient(closest-side, rgba(228,228,235,0.06), transparent 75%)' }}
            />

            <header className="relative shrink-0 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <Kicker>{format(month, 'yyyy')}</Kicker>
                  <h2 className="text-[26px] sm:text-[28px] font-semibold tracking-tight leading-none mt-1.5">
                    {capitalize(format(month, 'MMMM', { locale: dateFnsLocale(locale) }))}
                  </h2>
                </div>
                <div className={clsx('flex items-center gap-2 shrink-0 no-drag max-w-full', SCROLL_X)}>
                  <Segmented
                    size="sm"
                    value={tab}
                    onChange={setTab}
                    options={[
                      { value: 'pnl', label: t('cal.pnlTab') },
                      { value: 'events', label: t('cal.journalTab') },
                    ]}
                  />
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(subMonths(month, 1))} aria-label={t('cal.prev')}>
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      variant={viewingCurrentMonth ? 'primary' : 'outline'}
                      size="sm"
                      onClick={goToday}
                      className={clsx(
                        'min-w-[52px] text-[11px] font-semibold uppercase tracking-[0.14em]',
                        viewingCurrentMonth && 'bg-text text-black hover:bg-text hover:text-black',
                      )}
                    >
                      {t('common.today')}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(addMonths(month, 1))} aria-label={t('cal.next')}>
                      <ChevronRight size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t('cal.shareMonth')}
                      aria-label={t('cal.shareMonth')}
                      onClick={() => {
                        if (!monthAgg.count) {
                          toast(t('cal.noMonth'), 'info')
                          return
                        }
                        openShareCard({ kind: 'month', month: format(month, 'yyyy-MM') })
                      }}
                    >
                      <Share2 size={15} />
                    </Button>
                    <Button
                      variant={panelOpen ? 'ghost' : 'secondary'}
                      size="icon"
                      className="h-8 w-8"
                      title={panelOpen ? t('cal.hideDay') : t('cal.showDay')}
                      aria-label={panelOpen ? t('cal.hideDay') : t('cal.showDay')}
                      aria-pressed={panelOpen}
                      onClick={() => setPanelOpenPersist(!panelOpen)}
                    >
                      {panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-end gap-8 flex-wrap">
                <div className="min-w-0">
                  <Kicker>{t('cal.monthPnl')}</Kicker>
                  <Pnl value={monthAgg.pnl} className="mt-2 block text-[26px] font-semibold tracking-tight leading-none">
                    {fmtMoney(monthAgg.pnl, settings.currency, { sign: true })}
                  </Pnl>
                </div>
                <Detail
                  label={t('cal.days')}
                  value={
                    <>
                      <span className="text-accent">{monthAgg.greenDays}</span>
                      <span className="text-dim"> / </span>
                      <span className="text-loss">{monthAgg.redDays}</span>
                    </>
                  }
                />
                <Detail label={t('cal.winRate')} value={`${monthAgg.winRate.toFixed(0)}%`} />
              </div>
            </header>

            <div className="@container relative flex-1 min-h-0 min-w-0 px-4 pb-4 sm:px-5 overflow-hidden">
              <div
                className="grid gap-1.5 h-full min-w-0"
                style={{
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) minmax(1.85rem, 0.68fr)',
                  gridTemplateRows: `auto repeat(${weeks.length}, minmax(0, 1fr))`,
                }}
              >
                {weekdays.map((d) => (
                  <div
                    key={d}
                    className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted py-1 truncate"
                  >
                    {d}
                  </div>
                ))}
                <div className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted py-1 truncate">
                  {t('cal.weekCol')}
                </div>
                {weeks.map((week, wi) => (
                  <Fragment key={week[0].toISOString()}>
                    {week.map((d) => {
                      const key = format(d, 'yyyy-MM-dd')
                      const a = daily.get(key)
                      const events = notesByDay.get(key)
                      const inMonth = isSameMonth(d, month)
                      return (
                        <DayCell
                          key={key}
                          date={d}
                          agg={a}
                          events={events?.length ?? 0}
                          tab={tab}
                          inMonth={inMonth}
                          highlight={monthAgg.best?.key === key && (monthAgg.best?.pnl ?? 0) > 0}
                          selected={selected === key}
                          onClick={() => setSelected(selected === key ? null : key)}
                          currency={settings.currency}
                        />
                      )
                    })}
                    <WeekTotal
                      key={`sem-${wi}`}
                      total={weekTotals[wi]}
                      currency={settings.currency}
                      onShare={() => {
                        if (!weekTotals[wi].count) {
                          toast(t('cal.noWeek'), 'info')
                          return
                        }
                        openShareCard({ kind: 'week', start: format(week[0], 'yyyy-MM-dd') })
                      }}
                    />
                  </Fragment>
                ))}
              </div>
            </div>
            </div>
          </Card>

          <aside
            className={clsx(
              'flex flex-col min-h-0 overflow-hidden shrink-0',
              'transition-[width,opacity,max-height,margin] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              panelOpen
                ? 'w-full lg:w-[300px] opacity-100 max-h-[70vh] lg:max-h-none'
                : 'w-full lg:w-0 opacity-0 max-h-0 lg:max-h-none pointer-events-none lg:-ml-4',
            )}
            aria-hidden={!panelOpen}
          >
            <AnalyticsCard
              className="h-full min-h-0"
              bodyClassName="overflow-y-auto min-h-0"
              title={
                selected ? (
                  <span className="block">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">
                      {capitalize(fmtDate(selected, 'EEEE'))}
                    </span>
                    <span className="mt-1 block text-[15px] font-semibold tracking-tight text-text">
                      {capitalize(fmtDate(selected, locale === 'en' ? 'MMM d' : 'd MMM'))}
                    </span>
                  </span>
                ) : (
                  t('cal.pickDay')
                )
              }
              action={
                <div className="flex items-center gap-0.5">
                  {selected && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" title={t('cal.add')} onClick={() => openTradeModal(undefined, selected)}>
                      <Plus size={14} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={t('cal.hideDay')}
                    aria-label={t('cal.hideDay')}
                    onClick={() => setPanelOpenPersist(false)}
                  >
                    <PanelRightClose size={14} />
                  </Button>
                </div>
              }
            >
              <div ref={panelRef}>
                {selectedAgg || selectedNotes?.length ? (
                  <div className="flex flex-col gap-5">
                    {selectedAgg && (
                      <DayDetail
                        agg={selectedAgg}
                        currency={settings.currency}
                        onOpenTrade={(tr) => openTradeModal(tr)}
                      />
                    )}
                    {selectedNotes?.length ? (
                      <div>
                        <div className="flex items-baseline justify-between gap-3 mb-3">
                          <Kicker>{t('cal.journalTab')}</Kicker>
                          <span className="num text-[11px] text-muted">{selectedNotes.length}</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {selectedNotes.map((n) => (
                            <button
                              key={n.id}
                              onClick={() => goToPage('journal')}
                              className="text-left rounded-xl border border-white/[0.06] bg-transparent px-3 py-2.5 hover:border-white/20 hover:bg-white/[0.03] transition-colors"
                            >
                              <div className="text-[12px] font-medium truncate">{n.title || t('cal.untitled')}</div>
                              <div className="text-[11px] text-dim line-clamp-2 mt-0.5 leading-relaxed">{n.content}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <Empty
                    icon={<CalendarDays size={16} />}
                    title={selected ? t('cal.emptyDay') : t('cal.noDaySel')}
                    description={selected ? t('cal.emptyDayHint') : t('cal.emptySelHint')}
                    action={
                      selected ? (
                        <Button variant="outline" size="sm" onClick={() => openTradeModal(undefined, selected)}>
                          <Plus size={14} /> {t('cal.add')}
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </div>
            </AnalyticsCard>
          </aside>
        </div>
      </div>
    </>
  )
}

function WeekTotal({
  total,
  currency,
  onShare,
}: {
  total: { pnl: number; count: number; week: number }
  currency: 'USD' | 'EUR' | 'GBP'
  onShare: () => void
}) {
  const t = useT()
  const has = total.count > 0
  const pos = has && total.pnl > 0
  const neg = has && total.pnl < 0
  return (
    <button
      type="button"
      onClick={onShare}
      title={t('cal.shareWeek', { n: total.week })}
      className={clsx(
        'h-full min-h-0 min-w-0 self-stretch rounded-xl flex flex-col items-center justify-center px-0.5 text-center transition-colors border',
        !has && 'border-transparent bg-transparent hover:bg-white/[0.03]',
        has && 'border-white/[0.06]',
        pos && 'bg-accent/[0.06] hover:bg-accent/[0.1]',
        neg && 'bg-loss/[0.06] hover:bg-loss/[0.1]',
        has && !pos && !neg && 'bg-white/[0.02] hover:bg-white/[0.04]',
      )}
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted truncate max-w-full">
        {t('cal.weekN', { n: total.week })}
      </div>
      {has ? (
        <Pnl value={total.pnl} className="mt-1 text-[11px] @[400px]:text-[12px] font-semibold leading-tight truncate max-w-full">
          {fmtMoney(total.pnl, currency, { sign: true, decimals: Math.abs(total.pnl) >= 100 ? 0 : 2 })}
        </Pnl>
      ) : (
        <div className="text-[11px] text-dim/50 mt-1">—</div>
      )}
    </button>
  )
}

function DayDetail({
  agg,
  currency,
  onOpenTrade,
}: {
  agg: DayAgg
  currency: 'USD' | 'EUR' | 'GBP'
  onOpenTrade: (t: DayAgg['trades'][number]) => void
}) {
  const tx = useT()
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-x-5">
        <Detail
          label={tx('cal.dayPnl')}
          value={fmtMoney(agg.pnl, currency, { sign: true })}
          tone={agg.pnl > 0 ? 'green' : agg.pnl < 0 ? 'red' : undefined}
          size="lg"
        />
        <Detail label={tx('cal.ops')} value={String(agg.count)} hint={`${agg.wins}W / ${agg.losses}L`} />
      </div>

      <div className="flex flex-col divide-y divide-white/[0.05]">
        {[...agg.trades]
          .sort((a, b) => new Date(a.exitDate ?? a.entryDate).getTime() - new Date(b.exitDate ?? b.entryDate).getTime())
          .map((tr) => {
            const p = tradePnl(tr)
            return (
              <button
                key={tr.id}
                onClick={() => onOpenTrade(tr)}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <DirectionGlyph direction={tr.direction} />
                  <AssetLogo ticker={tr.symbol} size="xs" />
                  <span className="text-[13px] font-medium mono truncate">{tr.symbol}</span>
                </div>
                <Pnl value={p} className="text-[13px] font-semibold shrink-0">
                  {fmtMoney(p, currency, { sign: true })}
                </Pnl>
              </button>
            )
          })}
      </div>
    </div>
  )
}

function fmtCellPnl(value: number, currency: 'USD' | 'EUR' | 'GBP') {
  const abs = Math.abs(value)
  if (abs >= 1000) return fmtMoney(value, currency, { sign: true, compact: true, decimals: abs >= 10000 ? 0 : 1 })
  return fmtMoney(value, currency, { sign: true, decimals: abs >= 100 ? 0 : 2 })
}

function DayCell({
  date,
  agg,
  events,
  tab,
  inMonth,
  highlight,
  selected,
  onClick,
  currency,
}: {
  date: Date
  agg?: DayAgg
  events: number
  tab: 'pnl' | 'events'
  inMonth: boolean
  highlight: boolean
  selected: boolean
  onClick: () => void
  currency: 'USD' | 'EUR' | 'GBP'
}) {
  const t = useT()
  const has = !!agg && inMonth
  const pos = has && agg!.pnl > 0
  const neg = has && agg!.pnl < 0
  const eventDay = tab === 'events' && events > 0 && inMonth
  const today = isToday(date)

  return (
    <button
      onClick={onClick}
      disabled={!inMonth}
      title={has ? `${format(date, getAppLocale() === 'en' ? 'MMMM d' : "d 'de' MMMM", { locale: dateFnsLocale() })} · ${fmtMoney(agg!.pnl, currency, { sign: true })}` : undefined}
      className={clsx(
        'group relative h-full min-h-0 w-full min-w-0 overflow-hidden rounded-xl p-1.5 @[400px]:p-2 text-left transition-colors duration-150 flex flex-col border',
        !inMonth && 'opacity-40 bg-transparent border-transparent cursor-default',
        inMonth && !has && !eventDay && 'border-transparent bg-transparent hover:bg-white/[0.03]',
        inMonth && (has || eventDay) && 'border-white/[0.06]',
        tab === 'pnl' && has && pos && 'bg-accent/[0.06]',
        tab === 'pnl' && has && neg && 'bg-loss/[0.06]',
        tab === 'pnl' && has && !pos && !neg && 'bg-white/[0.02]',
        eventDay && 'bg-white/[0.03]',
        today && inMonth && 'ring-1 ring-text/50',
        selected && inMonth && '!border-white/25',
        highlight && inMonth && has && 'shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
      )}
    >
      <span className="num text-[11px] font-medium leading-none tabular-nums text-muted">
        {format(date, 'd')}
      </span>

      {tab === 'pnl' && has && (
        <div className="flex-1 min-h-0 flex items-center justify-center px-0.5">
          <Pnl
            value={agg!.pnl}
            className="block text-center font-semibold leading-none tracking-tight truncate max-w-full text-[12px] @[400px]:text-[13px]"
          >
            <span className="@[400px]:hidden">
              {fmtMoney(agg!.pnl, currency, { sign: true, compact: true, decimals: Math.abs(agg!.pnl) >= 1000 ? 1 : 0 })}
            </span>
            <span className="hidden @[400px]:inline">{fmtCellPnl(agg!.pnl, currency)}</span>
          </Pnl>
        </div>
      )}

      {tab === 'events' && eventDay && (
        <div className="flex-1 min-h-0 flex items-center justify-center text-[11px] text-muted font-medium">
          <NotebookPen size={11} />
          <span className="ml-1 hidden @[400px]:inline truncate">
            {events === 1 ? t('cal.note1') : t('cal.notesN', { n: events })}
          </span>
          <span className="ml-1 @[400px]:hidden num">{events}</span>
        </div>
      )}
    </button>
  )
}
