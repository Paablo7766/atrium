import { Fragment, useMemo, useRef, useState, type CSSProperties } from 'react'
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
  isWeekend,
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
import { Button, DirectionGlyph, Empty, Pnl, Segmented, Stat } from '@/components/ui'
import { dailyPnl, tradePnl, tradeR, type DayAgg } from '@/lib/stats'
import { capitalize, fmtDate, fmtMoney, fmtR } from '@/lib/format'


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

  const maxAbs = useMemo(() => {
    let m = 0
    for (const d of inMonthDays) {
      const a = daily.get(format(d, 'yyyy-MM-dd'))
      if (a) m = Math.max(m, Math.abs(a.pnl))
    }
    return m || 1
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
      <Topbar title={t('cal.title')} subtitle={tab === 'pnl' ? 'P&L' : t('nav.journal')} />

      <div className="page-stage">
        <div className="flex flex-col xl:flex-row gap-4 flex-1 min-h-0">
          <section className="relative card flex flex-col min-h-0 overflow-hidden flex-1 min-w-0 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_16px_40px_-28px_rgba(0,0,0,0.55)]">
            <header className="shrink-0 px-5 pt-5 pb-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-dim">{format(month, 'yyyy')}</div>
                  <h2 className="text-[28px] font-semibold tracking-tight leading-none mt-1">
                    {capitalize(format(month, 'MMMM', { locale: dateFnsLocale(locale) }))}
                  </h2>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <Segmented
                    size="sm"
                    value={tab}
                    onChange={setTab}
                    options={[
                      { value: 'pnl', label: 'P&L' },
                      { value: 'events', label: t('cal.journalTab') },
                    ]}
                  />
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(subMonths(month, 1))} aria-label={t('cal.prev')}>
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      variant={viewingCurrentMonth ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={goToday}
                      className="min-w-[52px]"
                    >
                      {t('common.today')}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(addMonths(month, 1))} aria-label={t('cal.next')}>
                      <ChevronRight size={16} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      title={t('cal.shareMonth')}
                      onClick={() => {
                        if (!monthAgg.count) {
                          toast(t('cal.noMonth'), 'info')
                          return
                        }
                        openShareCard({ kind: 'month', month: format(month, 'yyyy-MM') })
                      }}
                    >
                      <Share2 size={14} /> {t('common.month')}
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

              <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-4 items-start">
                <div className="min-w-0 col-span-2 sm:col-span-1">
                  <div className="text-[12px] font-medium text-muted">{t('cal.monthPnl')}</div>
                  <Pnl value={monthAgg.pnl} className="text-[26px] font-semibold tracking-tight leading-none mt-2 block">
                    {fmtMoney(monthAgg.pnl, settings.currency, { sign: true })}
                  </Pnl>
                </div>
                <Stat label={t('cal.trades')} value={monthAgg.count} />
                <Stat label="Win rate" value={`${monthAgg.winRate.toFixed(0)}%`} />
                <Stat
                  label={t('cal.days')}
                  value={
                    <span>
                      <span className="text-accent">{monthAgg.greenDays}</span>
                      <span className="text-dim"> / </span>
                      <span className="text-loss">{monthAgg.redDays}</span>
                    </span>
                  }
                />
                <Stat
                  label={t('cal.best')}
                  value={
                    monthAgg.best ? (
                      <Pnl value={monthAgg.best.pnl} className="text-[17px] font-semibold">
                        {fmtMoney(monthAgg.best.pnl, settings.currency, { sign: true, decimals: 0 })}
                      </Pnl>
                    ) : (
                      '—'
                    )
                  }
                />
              </div>
              <MonthStrip days={inMonthDays} daily={daily} maxAbs={maxAbs} selected={selected} onSelect={setSelected} currency={settings.currency} />
            </header>

            <div className="flex-1 min-h-0 px-5 pb-2 overflow-hidden">
              <div
                className="grid gap-[5px] h-full"
                style={{
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) 2.75rem',
                  gridTemplateRows: `auto repeat(${weeks.length}, minmax(0, 1fr))`,
                }}
              >
              {weekdays.map((d, i) => {
                const weekend = weekStartsOn === 0 ? i === 0 || i === 6 : i >= 5
                return (
                  <div
                    key={d}
                    className={clsx(
                      'text-center text-[10px] font-semibold uppercase tracking-[0.16em] py-1',
                      weekend ? 'text-dim/70' : 'text-dim',
                    )}
                  >
                    {d}
                  </div>
                )
              })}
              <div className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-dim/60 py-1">{t('cal.weekCol')}</div>
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
                        intensity={a ? Math.abs(a.pnl) / maxAbs : 0}
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

            <footer className="shrink-0 px-5 py-2.5 flex items-center justify-between gap-4 border-t border-border/70">
              <div className="flex items-center gap-2 text-[11px] text-dim">
                <span>{t('cal.loss')}</span>
                <div className="flex items-center gap-[3px]">
                  {[0.14, 0.22, 0.34, 0.48].map((a) => (
                    <span key={a} className="h-2 w-3 rounded-[3px]" style={{ background: `rgba(90,28,38,${a / 0.48})`, boxShadow: `inset 0 0 0 1px rgba(248,113,113,${a * 0.55})` }} />
                  ))}
                </div>
                <div className="flex items-center gap-[3px]">
                  {[0.14, 0.22, 0.34, 0.48].map((a) => (
                    <span key={a} className="h-2 w-3 rounded-[3px]" style={{ background: `rgba(18,72,48,${a / 0.48})`, boxShadow: `inset 0 0 0 1px rgba(74,222,128,${a * 0.55})` }} />
                  ))}
                </div>
                <span>{t('cal.gain')}</span>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-dim">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-[16px] h-[16px] rounded-full border border-text/55 text-text text-[9px] font-semibold flex items-center justify-center">
                    {format(new Date(), 'd')}
                  </span>
                  {t('common.today')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet" />
                  {t('cal.notes')}
                </span>
              </div>
            </footer>
          </section>

          <aside
            className={clsx(
              'flex flex-col min-h-0 overflow-hidden rounded-[18px] border bg-surface/40 shrink-0',
              'transition-[width,opacity,max-height,border-color,margin] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              panelOpen
                ? 'w-full xl:w-[280px] opacity-100 max-h-[70vh] xl:max-h-none border-border/70'
                : 'w-full xl:w-0 opacity-0 max-h-0 xl:max-h-none border-transparent pointer-events-none xl:-ml-4',
            )}
            aria-hidden={!panelOpen}
          >
            <header className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 shrink-0 border-b border-border/50">
              <div className="min-w-0">
                {selected ? (
                  <>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">
                      {capitalize(fmtDate(selected, 'EEEE'))}
                    </div>
                    <h3 className="text-[16px] font-semibold tracking-tight leading-none mt-1 truncate text-text-2">
                      {capitalize(fmtDate(selected, locale === 'en' ? 'MMM d' : "d MMM"))}
                    </h3>
                  </>
                ) : (
                  <h3 className="text-[13px] font-medium tracking-tight text-muted">{t('cal.pickDay')}</h3>
                )}
                <p className="text-[11px] text-dim mt-1.5 leading-snug">
                  {selectedAgg
                    ? selectedAgg.count === 1 ? t('cal.trade1') : t('cal.tradesN', { n: selectedAgg.count })
                    : selectedNotes?.length
                      ? selectedNotes.length === 1 ? t('cal.entry1') : t('cal.entriesN', { n: selectedNotes.length })
                      : selected
                        ? t('cal.noActivity')
                        : t('cal.pickHint')}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {selected && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" title={t('cal.add')} onClick={() => openTradeModal(undefined, selected)}>
                    <Plus size={14} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title={t('cal.hideDay')}
                  aria-label={t('cal.hideDay')}
                  onClick={() => setPanelOpenPersist(false)}
                >
                  <PanelRightClose size={14} />
                </Button>
              </div>
            </header>

            <div ref={panelRef} className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3.5">
              {selectedAgg || selectedNotes?.length ? (
                <div className="flex flex-col gap-4">
                  {selectedAgg && (
                    <DayDetail
                      agg={selectedAgg}
                      currency={settings.currency}
                      onOpenTrade={(t) => openTradeModal(t)}
                    />
                  )}
                  {selectedNotes?.length ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim px-0.5">
                        {t('cal.journalTab')}
                      </div>
                      {selectedNotes.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => goToPage('journal')}
                          className="text-left rounded-xl border border-border/70 bg-transparent px-3 py-2.5 hover:border-violet/35 hover:bg-violet/[0.05] transition-colors"
                        >
                          <div className="text-[12px] font-medium truncate">{n.title || t('cal.untitled')}</div>
                          <div className="text-[11px] text-dim line-clamp-2 mt-0.5 leading-relaxed">{n.content}</div>
                        </button>
                      ))}
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
          </aside>
        </div>
      </div>
    </>
  )
}

function MonthStrip({
  days,
  daily,
  maxAbs,
  selected,
  onSelect,
  currency,
}: {
  days: Date[]
  daily: Map<string, DayAgg>
  maxAbs: number
  selected: string | null
  onSelect: (key: string) => void
  currency: 'USD' | 'EUR' | 'GBP'
}) {
  return (
    <div className="flex items-end gap-[3px] h-4 mt-4">
      {days.map((d) => {
        const key = format(d, 'yyyy-MM-dd')
        const a = daily.get(key)
        const intensity = a ? Math.abs(a.pnl) / maxAbs : 0
        const h = a ? 5 + intensity * 11 : 3
        const pos = (a?.pnl ?? 0) > 0
        const neg = (a?.pnl ?? 0) < 0
        return (
          <button
            key={key}
            title={a ? `${fmtDate(key, 'd MMM')} · ${fmtMoney(a.pnl, currency, { sign: true, decimals: 0 })}` : fmtDate(key, 'd MMM')}
            onClick={() => onSelect(key)}
            className={clsx(
              'flex-1 min-w-0 rounded-[2px] transition-all',
              !a && 'bg-surface-4/80 hover:bg-surface-4',
              a && pos && 'bg-accent/70 hover:bg-accent',
              a && neg && 'bg-loss/70 hover:bg-loss',
              a && !pos && !neg && 'bg-border-3',
              selected === key && 'ring-1 ring-text/80',
              isToday(d) && !a && 'bg-sky/50',
            )}
            style={{ height: h }}
          />
        )
      })}
    </div>
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
  return (
    <button
      type="button"
      onClick={onShare}
      title={`Compartir semana ${total.week}`}
      className="h-full min-h-0 self-stretch rounded-xl flex flex-col items-center justify-center px-0.5 text-center hover:bg-surface-3/80 transition-colors"
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-dim/80">S{total.week}</div>
      {total.count ? (
        <Pnl value={total.pnl} className="mt-1 text-[11px] font-semibold leading-tight">
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
    <div className="flex flex-col gap-3.5">
      <div className="px-0.5">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-dim">{tx('cal.dayPnl')}</div>
        <Pnl value={agg.pnl} className="text-[22px] font-semibold tracking-tight leading-none mt-1.5 block">
          {fmtMoney(agg.pnl, currency, { sign: true })}
        </Pnl>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-dim">
          <span>
            <span className="text-muted">{tx('cal.ops')}</span>{' '}
            <span className="num text-text-2 font-semibold">{agg.count}</span>
          </span>
          <span className="text-border-3">·</span>
          <span>
            <span className="text-accent num font-semibold">{agg.wins}</span>
            <span className="text-dim"> / </span>
            <span className="text-loss num font-semibold">{agg.losses}</span>
          </span>
          <span className="text-border-3">·</span>
          <span className="num text-text-2 font-semibold">
            {fmtMoney(agg.pnl / agg.count, currency, { sign: true, decimals: 0 })}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-dim px-0.5 mb-1">{tx('cal.trades')}</div>
        {[...agg.trades]
          .sort((a, b) => new Date(a.exitDate ?? a.entryDate).getTime() - new Date(b.exitDate ?? b.entryDate).getTime())
          .map((t) => {
            const p = tradePnl(t)
            const r = tradeR(t)
            return (
              <button
                key={t.id}
                onClick={() => onOpenTrade(t)}
                className="flex items-center justify-between rounded-lg border border-transparent px-2 py-2 text-left hover:bg-surface-2/80 hover:border-border/60 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <DirectionGlyph direction={t.direction} />
                  <AssetLogo ticker={t.symbol} size="xs" />
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold mono leading-tight">{t.symbol}</div>
                    <div className="text-[10px] text-dim truncate leading-tight mt-0.5">
                      {fmtDate(t.entryDate, 'HH:mm')} · {t.strategy || tx('common.noStrategy')}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 pl-2">
                  <Pnl value={p} className="text-[12px] font-semibold block leading-tight">
                    {fmtMoney(p, currency, { sign: true })}
                  </Pnl>
                  <div className={clsx('text-[10px] num leading-tight mt-0.5', r === null ? 'text-dim' : r >= 0 ? 'text-accent' : 'text-loss')}>{fmtR(r)}</div>
                </div>
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
  intensity,
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
  intensity: number
  highlight: boolean
  selected: boolean
  onClick: () => void
  currency: 'USD' | 'EUR' | 'GBP'
}) {
  const has = !!agg && inMonth
  const pos = has && agg!.pnl > 0
  const neg = has && agg!.pnl < 0
  const eventDay = tab === 'events' && events > 0 && inMonth
  const today = isToday(date)
  const weekend = isWeekend(date)
  const depth = 0.22 + Math.pow(intensity, 0.65) * 0.38
  const edge = 0.14 + intensity * 0.22

  const style: CSSProperties | undefined =
    tab === 'pnl' && has
      ? highlight
        ? {
            background: `linear-gradient(165deg, rgba(120, 86, 28, ${0.28 + intensity * 0.28}) 0%, rgba(58, 42, 14, ${0.45 + intensity * 0.2}) 100%)`,
            borderColor: `rgba(251, 191, 36, ${0.28 + intensity * 0.25})`,
            boxShadow: `inset 0 1px 0 rgba(251, 191, 36, 0.08)`,
          }
        : pos
          ? {
              background: `linear-gradient(165deg, rgba(28, 92, 58, ${depth * 0.85}) 0%, rgba(12, 48, 32, ${depth}) 100%)`,
              borderColor: `rgba(74, 222, 128, ${edge})`,
              boxShadow: `inset 0 1px 0 rgba(74, 222, 128, 0.06)`,
            }
          : neg
            ? {
                background: `linear-gradient(165deg, rgba(98, 32, 42, ${depth * 0.85}) 0%, rgba(48, 16, 22, ${depth}) 100%)`,
                borderColor: `rgba(248, 113, 113, ${edge})`,
                boxShadow: `inset 0 1px 0 rgba(248, 113, 113, 0.06)`,
              }
            : undefined
      : undefined

  return (
    <button
      onClick={onClick}
      disabled={!inMonth}
      style={style}
      title={has ? `${format(date, getAppLocale() === 'en' ? 'MMMM d' : "d 'de' MMMM", { locale: dateFnsLocale() })} · ${fmtMoney(agg!.pnl, currency, { sign: true })}` : undefined}
      className={clsx(
        'group relative h-full min-h-0 w-full min-w-0 overflow-hidden rounded-[10px] border p-2 text-left transition-all duration-150 flex flex-col',
        !inMonth && 'opacity-[0.22] bg-transparent border-transparent cursor-default',
        inMonth && !has && !eventDay && (weekend ? 'bg-[#0c0c0e] border-border/50' : 'bg-[#101012] border-border/80'),
        inMonth && !has && !eventDay && 'hover:border-border-2 hover:bg-surface-3/60',
        tab === 'pnl' && has && !pos && !neg && 'border-border bg-surface-2',
        tab === 'pnl' && has && 'hover:brightness-[1.08]',
        eventDay && 'bg-violet/[0.1] border-violet/20 hover:border-violet/45',
        selected && inMonth && 'ring-1 ring-text/70 border-transparent z-[1] brightness-110',
      )}
    >
      <div className="relative z-[1] flex items-start justify-between gap-1">
        <span
          className={clsx(
            'num flex items-center justify-center font-medium leading-none tabular-nums',
            today
              ? 'w-[18px] h-[18px] rounded-full border border-text/60 text-text text-[10px] font-semibold'
              : clsx(
                  'text-[11px]',
                  highlight ? 'text-amber/70' : pos ? 'text-accent/55' : neg ? 'text-loss/55' : has || eventDay ? 'text-muted' : 'text-dim',
                ),
          )}
        >
          {format(date, 'd')}
        </span>
        {inMonth && events > 0 && tab === 'pnl' && <span className="mt-1 mr-0.5 w-1.5 h-1.5 rounded-full bg-violet/80 shrink-0" />}
      </div>

      {tab === 'pnl' && has && (
        <div className="relative z-[1] flex-1 min-h-0 flex items-center justify-center px-0.5 -mt-0.5">
          <Pnl
            value={agg!.pnl}
            className={clsx(
              'block text-center font-semibold leading-none tracking-tight truncate max-w-full',
              Math.abs(agg!.pnl) >= 1000 ? 'text-[12px] sm:text-[13px]' : 'text-[11px] sm:text-[12px]',
              highlight && '!text-amber',
            )}
          >
            {fmtCellPnl(agg!.pnl, currency)}
          </Pnl>
        </div>
      )}

      {tab === 'events' && eventDay && (
        <div className="relative z-[1] flex-1 min-h-0 flex items-center justify-center gap-1 text-[11px] text-violet font-medium">
          <NotebookPen size={11} />
          {events} {events === 1 ? 'nota' : 'notas'}
        </div>
      )}
    </button>
  )
}
