import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { ArrowUpDown, Check, ChevronDown, ChevronUp, Copy, Download, ListOrdered, Pencil, Plus, Search, Share2, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useStore } from '@/store'
import { Topbar } from '@/components/Topbar'
import { AssetLogo } from '@/components/AssetLogo'
import { Badge, Button, Confirm, DirectionGlyph, Empty, Input, Menu, Pnl, Segmented, Select, Stars, menuRowClass } from '@/components/ui'
import { computeStats, tradeDurationMs, tradeOutcome, tradePnl, tradeR, tradeReturnPct, tradeRisk, uniqueValues } from '@/lib/stats'
import { fmtDate, fmtDuration, fmtMoney, fmtPct, fmtPrice, fmtR } from '@/lib/format'
import { exportFile } from '@/lib/db/client'
import type { Market, Trade } from '@/types'
import { tradesToCsv } from '@/lib/csv'
import { useT } from '@/lib/useI18n'
import { marketLabel, emotionLabel, mistakeLabel } from '@/lib/i18n'

type Filter = 'all' | 'wins' | 'losses' | 'open'
type SortKey = 'date' | 'symbol' | 'pnl' | 'r' | 'duration' | 'rating'

const COLS = 9

export function Trades() {
  const trades = useStore((s) => s.trades)
  const cashflows = useStore((s) => s.cashflows)
  const settings = useStore((s) => s.settings)
  const openTradeModal = useStore((s) => s.openTradeModal)
  const openShareCard = useStore((s) => s.openShareCard)
  const deleteTrade = useStore((s) => s.deleteTrade)
  const duplicateTrade = useStore((s) => s.duplicateTrade)
  const toast = useStore((s) => s.toast)
  const tradesQuery = useStore((s) => s.tradesQuery)
  const setTradesQuery = useStore((s) => s.setTradesQuery)

  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState(tradesQuery)

  useEffect(() => {
    if (tradesQuery) setQ(tradesQuery)
  }, [tradesQuery])
  const [market, setMarket] = useState('')
  const [strategy, setStrategy] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [toDelete, setToDelete] = useState<Trade | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef<HTMLButtonElement>(null)
  const tx = useT()
  const locale = settings.locale ?? 'es'

  const markets = useMemo(() => uniqueValues(trades, (t) => t.market), [trades])
  const strategies = useMemo(() => uniqueValues(trades, (t) => t.strategy), [trades])

  const counts = useMemo(
    () => ({
      all: trades.length,
      wins: trades.filter((t) => tradeOutcome(t) === 'WIN').length,
      losses: trades.filter((t) => tradeOutcome(t) === 'LOSS').length,
      open: trades.filter((t) => t.status === 'OPEN').length,
    }),
    [trades],
  )

  const rows = useMemo(() => {
    let list = trades
    if (filter === 'wins') list = list.filter((t) => tradeOutcome(t) === 'WIN')
    if (filter === 'losses') list = list.filter((t) => tradeOutcome(t) === 'LOSS')
    if (filter === 'open') list = list.filter((t) => t.status === 'OPEN')
    if (market) list = list.filter((t) => t.market === market)
    if (strategy) list = list.filter((t) => t.strategy === strategy)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(
        (t) =>
          t.symbol.toLowerCase().includes(s) ||
          t.strategy.toLowerCase().includes(s) ||
          t.notes.toLowerCase().includes(s) ||
          t.tags.some((tag) => tag.toLowerCase().includes(s)),
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'symbol':
          return a.symbol.localeCompare(b.symbol) * dir
        case 'pnl':
          return (tradePnl(a) - tradePnl(b)) * dir
        case 'r':
          return ((tradeR(a) ?? -Infinity) - (tradeR(b) ?? -Infinity)) * dir
        case 'duration':
          return (tradeDurationMs(a) - tradeDurationMs(b)) * dir
        case 'rating':
          return (a.rating - b.rating) * dir
        default:
          return (new Date(a.exitDate ?? a.entryDate).getTime() - new Date(b.exitDate ?? b.entryDate).getTime()) * dir
      }
    })
  }, [trades, filter, market, strategy, q, sortKey, sortDir])

  const allStats = useMemo(() => computeStats(trades, settings.startingBalance, cashflows), [trades, settings.startingBalance, cashflows])
  const view = useMemo(() => computeStats(rows, settings.startingBalance), [rows, settings.startingBalance])
  const total = useMemo(() => rows.reduce((a, t) => a + tradePnl(t), 0), [rows])
  const isFiltered = filter !== 'all' || !!market || !!strategy || !!q.trim()
  const secondaryFilters = (market ? 1 : 0) + (strategy ? 1 : 0)

  const kpi = isFiltered
    ? { pnl: total, wins: view.wins, losses: view.losses, winRate: view.winRate, open: view.open }
    : { pnl: allStats.netPnl, wins: allStats.wins, losses: allStats.losses, winRate: allStats.winRate, open: allStats.open }

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  const clearFilters = () => {
    setFilter('all')
    setMarket('')
    setStrategy('')
    setQ('')
    setTradesQuery('')
  }

  const exportCsv = async () => {
    const ok = await exportFile(tradesToCsv(rows), `operaciones-${new Date().toISOString().slice(0, 10)}.csv`, [{ name: 'CSV', extensions: ['csv'] }])
    if (ok) toast(tx('trades.exported', { n: rows.length }), 'success')
  }

  const marketOptions = [{ value: '', label: tx('common.allM') }, ...markets.map((m) => ({ value: m, label: marketLabel(locale, m as Market) }))]
  const strategyOptions = [{ value: '', label: tx('common.all') }, ...strategies.map((m) => ({ value: m, label: m }))]

  const Th = ({ k, children, align = 'left', className }: { k?: SortKey; children?: ReactNode; align?: 'left' | 'right'; className?: string }) => (
    <th
      className={clsx(
        'font-semibold px-3 h-10 text-[10px] uppercase tracking-[0.14em] text-dim select-none whitespace-nowrap border-b border-border',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      {k ? (
        <button
          onClick={() => toggleSort(k)}
          className={clsx('inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-text transition-colors', sortKey === k && 'text-text')}
        >
          {children}
          {sortKey === k ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : <ArrowUpDown size={11} className="opacity-40" />}
        </button>
      ) : (
        children
      )}
    </th>
  )

  return (
    <>
      <Topbar title={tx('trades.title')} subtitle={trades.length ? tx('trades.countN', { n: trades.length }) : tx('trades.none')} />

      <div className="page-stage">
        <header className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap shrink-0 animate-fade-up">
          {trades.length > 0 && (
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-dim">{isFiltered ? tx('trades.viewPnl') : tx('trades.bookPnl')}</div>
              <div className="flex items-baseline gap-x-4 gap-y-1.5 mt-2 flex-wrap">
                <Pnl value={kpi.pnl} className="text-[30px] font-semibold tracking-[-0.035em] leading-none">
                  {fmtMoney(kpi.pnl, settings.currency, { sign: true })}
                </Pnl>
                <div className="flex items-center gap-2.5 text-[12px] text-muted num">
                  <span>
                    <span className="text-accent">{kpi.wins}W</span>
                    <span className="text-dim"> / </span>
                    <span className="text-loss">{kpi.losses}L</span>
                  </span>
                  <span className="text-border-3">·</span>
                  <span>
                    {tx('dash.winRate')} <span className="text-text-2">{fmtPct(kpi.winRate, 0)}</span>
                  </span>
                  {kpi.open > 0 && (
                    <>
                      <span className="text-border-3">·</span>
                      <span className="inline-flex items-center gap-1.5 text-sky">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky" />
                        {tx('trades.openN', { n: kpi.open })}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {isFiltered && <div className="num text-[12px] text-dim mt-2">{tx('trades.ofTotal', { n: rows.length, total: trades.length })}</div>}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download size={14} /> CSV
            </Button>
            <Button variant="primary" size="sm" onClick={() => openTradeModal()}>
              <Plus size={14} strokeWidth={2.5} /> {tx('nav.newTrade')}
            </Button>
          </div>
        </header>

        <div className="card flex-1 min-h-0 overflow-hidden flex flex-col animate-fade-up delay-1">
          <div className="px-5 py-3.5 flex items-center gap-2.5 flex-wrap border-b border-border shrink-0">
            <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0">
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: tx('common.all'), count: counts.all },
                  { value: 'wins', label: tx('trades.wins'), count: counts.wins },
                  { value: 'losses', label: tx('trades.losses'), count: counts.losses },
                  { value: 'open', label: tx('common.openPlural'), count: counts.open },
                ]}
              />
            </div>
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setTradesQuery(e.target.value)
                }}
                placeholder={tx('trades.search')}
                className={clsx('pl-9', q.trim() && 'pr-9')}
              />
              {q.trim() && (
                <button
                  type="button"
                  title={tx('common.clear')}
                  onClick={() => {
                    setQ('')
                    setTradesQuery('')
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-dim hover:text-text hover:bg-surface-4 transition-colors"
                >
                  <X size={13} strokeWidth={2.25} />
                </button>
              )}
            </div>

            <div className="hidden lg:block w-36 shrink-0">
              <Select value={market} onChange={setMarket} placeholder={tx('trades.market')} options={marketOptions} />
            </div>
            <div className="hidden lg:block w-40 shrink-0">
              <Select value={strategy} onChange={setStrategy} placeholder={tx('trades.strategy')} options={strategyOptions} />
            </div>

            <div className="lg:hidden shrink-0">
              <button
                ref={filtersRef}
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className={clsx(
                  'h-9.5 px-3 rounded-xl border inline-flex items-center gap-2 text-[13px] font-medium transition-colors',
                  filtersOpen || secondaryFilters ? 'border-border-3 text-text bg-surface-3' : 'border-border-2 text-muted bg-surface-2 hover:text-text',
                )}
              >
                <SlidersHorizontal size={14} />
                {tx('trades.filters')}
                {secondaryFilters > 0 && <span className="num text-[10px] leading-none px-1.5 py-0.5 rounded-md bg-text text-black">{secondaryFilters}</span>}
              </button>
              <Menu open={filtersOpen} onClose={() => setFiltersOpen(false)} anchorRef={filtersRef} className="min-w-56">
                <FilterGroup label={tx('trades.market')} value={market} onChange={setMarket} options={marketOptions} />
                <div className="mt-1 pt-1 border-t border-border">
                  <FilterGroup label={tx('trades.strategy')} value={strategy} onChange={setStrategy} options={strategyOptions} />
                </div>
              </Menu>
            </div>

            {isFiltered && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
                <X size={13} /> {tx('trades.clearFilters')}
              </Button>
            )}
          </div>

          {rows.length ? (
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 glass">
                  <tr className="bg-surface-2/40">
                    <Th k="date" className="pl-6">{tx('trades.date')}</Th>
                    <Th k="symbol">{tx('trades.instrument')}</Th>
                    <Th align="right" className="hidden xl:table-cell">{tx('trades.entry')}</Th>
                    <Th align="right" className="hidden xl:table-cell">{tx('trades.exit')}</Th>
                    <Th align="right" className="hidden xl:table-cell">{tx('trades.size')}</Th>
                    <Th className="hidden lg:table-cell">{tx('trades.strategy')}</Th>
                    <Th k="pnl" align="right">P&L</Th>
                    <Th k="r" align="right" className="hidden sm:table-cell">R</Th>
                    <Th className="pr-5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const pnl = tradePnl(t)
                    const r = tradeR(t)
                    const open = t.status === 'OPEN'
                    const isExp = expanded === t.id
                    const rail = open ? 'bg-sky' : pnl > 0 ? 'bg-accent' : pnl < 0 ? 'bg-loss' : 'bg-border-3'
                    const cell = 'px-3 py-4 border-t border-border/70'
                    return (
                      <Fragment key={t.id}>
                        <tr
                          className={clsx('group cursor-pointer transition-colors', isExp ? 'bg-surface-2/60' : 'hover:bg-surface-2/50')}
                          onClick={() => setExpanded(isExp ? null : t.id)}
                          onDoubleClick={() => openTradeModal(t)}
                        >
                          <td className={clsx(cell, 'relative pl-6 whitespace-nowrap')}>
                            <span
                              className={clsx(
                                'absolute left-0 top-3 bottom-3 w-[2px] rounded-full transition-opacity',
                                rail,
                                isExp ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
                              )}
                            />
                            <div className="text-[13px] font-medium tracking-tight leading-none">{fmtDate(t.exitDate ?? t.entryDate, 'dd MMM yyyy')}</div>
                            <div className="num text-[11px] text-dim mt-1.5 leading-none">
                              {fmtDate(t.entryDate, 'HH:mm')}
                              {t.exitDate ? ` → ${fmtDate(t.exitDate, 'HH:mm')}` : ''}
                            </div>
                          </td>
                          <td className={clsx(cell, 'whitespace-nowrap')}>
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 shrink-0 flex justify-center">
                                <DirectionGlyph direction={t.direction} />
                              </span>
                              <AssetLogo ticker={t.symbol} size="sm" />
                              <div className="min-w-0">
                                <div className="font-semibold mono text-[13px] tracking-tight leading-none">{t.symbol}</div>
                                <div className="text-[11px] text-dim mt-1.5 leading-none">{marketLabel(locale, t.market)}</div>
                              </div>
                            </div>
                          </td>
                          <td className={clsx(cell, 'hidden xl:table-cell text-right mono text-[13px] text-text-2 whitespace-nowrap')}>{fmtPrice(t.entryPrice)}</td>
                          <td className={clsx(cell, 'hidden xl:table-cell text-right mono text-[13px] text-muted whitespace-nowrap')}>{open ? '—' : fmtPrice(t.exitPrice)}</td>
                          <td className={clsx(cell, 'hidden xl:table-cell text-right mono text-[13px] text-muted whitespace-nowrap')}>
                            {t.quantity}
                            {t.multiplier !== 1 && <span className="text-dim text-[11px]"> ×{t.multiplier >= 1000 ? `${t.multiplier / 1000}k` : t.multiplier}</span>}
                          </td>
                          <td className={clsx(cell, 'hidden lg:table-cell max-w-48')}>
                            <div className="flex flex-col items-start gap-1.5 min-w-0">
                              {t.strategy ? (
                                <span className="inline-flex max-w-full items-center h-6 px-2 rounded-md bg-surface-3/70 border border-border text-[11px] font-medium text-text-2 truncate">
                                  {t.strategy}
                                </span>
                              ) : (
                                <span className="text-[12px] text-dim">—</span>
                              )}
                              {t.rating > 0 && <Stars value={t.rating} size={10} />}
                            </div>
                          </td>
                          <td className={clsx(cell, 'text-right whitespace-nowrap')}>
                            {open ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky" />
                                {tx('common.inProgress')}
                              </span>
                            ) : (
                              <Pnl value={pnl} className="font-semibold text-[13px] tracking-tight">
                                {fmtMoney(pnl, settings.currency, { sign: true })}
                              </Pnl>
                            )}
                          </td>
                          <td className={clsx(cell, 'hidden sm:table-cell text-right whitespace-nowrap')}>
                            {r === null ? (
                              <span className="text-[13px] text-dim">—</span>
                            ) : (
                              <Pnl value={r} className="text-[13px]">
                                {fmtR(r)}
                              </Pnl>
                            )}
                          </td>
                          <td className={clsx(cell, 'pl-2 pr-4 text-right w-32')}>
                            <div
                              className={clsx(
                                'flex items-center justify-end gap-0.5 transition-opacity',
                                q.trim() || isExp ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!open && (
                                <IconBtn title={tx('trades.share')} onClick={() => openShareCard({ kind: 'trade', tradeId: t.id })}>
                                  <Share2 size={13} />
                                </IconBtn>
                              )}
                              <IconBtn title={tx('trades.edit')} onClick={() => openTradeModal(t)}>
                                <Pencil size={13} />
                              </IconBtn>
                              <IconBtn
                                title={tx('trades.duplicate')}
                                onClick={() => {
                                  duplicateTrade(t.id)
                                  toast(tx('trades.duplicated'), 'success')
                                }}
                              >
                                <Copy size={13} />
                              </IconBtn>
                              <IconBtn title={tx('common.delete')} danger onClick={() => setToDelete(t)}>
                                <Trash2 size={13} />
                              </IconBtn>
                            </div>
                          </td>
                        </tr>
                        {isExp && (
                          <tr className="bg-surface-2/60">
                            <td colSpan={COLS} className="px-5 pb-5 pt-1">
                              <TradeDetails t={t} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon={<ListOrdered size={20} />}
              title={trades.length ? tx('trades.noResults') : tx('trades.noTradesYet')}
              description={trades.length ? tx('trades.noResultsHint') : tx('trades.noTradesHint')}
              action={
                trades.length ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <X size={13} /> {tx('trades.clearFilters')}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => openTradeModal()}>
                    <Plus size={14} /> {tx('nav.newTrade')}
                  </Button>
                )
              }
            />
          )}
        </div>
      </div>

      <Confirm
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            deleteTrade(toDelete.id)
            toast(tx('trades.deleted'), 'info')
          }
        }}
        title={tx('trades.deleteTitle')}
        message={tx('trades.deleteMsgDate', { symbol: toDelete?.symbol ?? '', date: toDelete ? fmtDate(toDelete.entryDate) : '' })}
      />
    </>
  )
}

function FilterGroup({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">{label}</div>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value || o.label} type="button" role="option" aria-selected={on} onClick={() => onChange(o.value)} className={menuRowClass(on)}>
            <span className="truncate flex-1">{o.label}</span>
            {on && <Check size={14} className="text-text shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}

function IconBtn({ children, onClick, title, danger }: { children: ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={clsx('w-7 h-7 rounded-lg flex items-center justify-center transition-colors', danger ? 'text-muted hover:text-loss hover:bg-loss/10' : 'text-muted hover:text-text hover:bg-surface-4')}
    >
      {children}
    </button>
  )
}

function TradeDetails({ t: tr }: { t: Trade }) {
  const settings = useStore((s) => s.settings)
  const tx = useT()
  const locale = settings.locale ?? 'es'
  const ret = tradeReturnPct(tr)
  const risk = tradeRisk(tr)
  const open = tr.status === 'OPEN'
  const setup = (settings.playbook ?? []).find((s) => s.id === tr.setupId)
  const done = new Set(tr.checklistDone ?? [])
  const checklist = setup?.checklist ?? []
  const doneCount = checklist.filter((c) => done.has(c.id)).length
  const hasChips = tr.tags.length > 0 || tr.pnlOverride !== undefined || (tr.mistakes ?? []).length > 0
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] rounded-2xl border border-border bg-surface/70 overflow-hidden shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] animate-fade-in">
      <div className="p-5 lg:p-6 space-y-6 min-w-0">
        <DetailSection label={tx('trades.execution')}>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-4">
            <Detail label={tx('modal.entry')} value={fmtPrice(tr.entryPrice)} mono />
            <Detail label={tx('modal.exit')} value={open ? tx('common.none') : fmtPrice(tr.exitPrice)} mono />
            <Detail label={tx('modal.qty')} value={tr.multiplier !== 1 ? `${tr.quantity} ×${tr.multiplier}` : String(tr.quantity)} mono />
            <Detail label={tx('modal.stop')} value={tr.stopLoss !== undefined ? fmtPrice(tr.stopLoss) : tx('common.none')} mono />
            <Detail label={tx('modal.tp')} value={tr.takeProfit !== undefined ? fmtPrice(tr.takeProfit) : tx('common.none')} mono />
            <Detail label={tx('modal.risk1r')} value={risk ? fmtMoney(risk, settings.currency) : tx('common.none')} mono />
            <Detail label={tx('trades.return')} value={ret !== null ? fmtPct(ret, 2, { sign: true }) : tx('common.none')} mono tone={ret !== null ? (ret >= 0 ? 'green' : 'red') : undefined} />
            <Detail label={tx('modal.fees')} value={fmtMoney(tr.fees, settings.currency)} mono />
            <Detail label={tx('an.duration')} value={fmtDuration(tradeDurationMs(tr))} mono />
            <Detail label={tx('modal.direction')} value={tr.direction === 'NONE' ? tx('common.none') : tr.direction === 'SHORT' ? tx('dir.short') : tx('dir.long')} />
          </div>
        </DetailSection>

        <DetailSection label={tx('trades.context')}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <Detail label={tx('modal.setup')} value={setup?.name ?? tx('common.none')} />
            <Detail label={tx('modal.emotion')} value={tr.emotion ? emotionLabel(locale, tr.emotion) : tx('common.none')} />
            <Detail label={tx('trades.strategy')} value={tr.strategy || tx('common.none')} />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-4">
            {hasChips ? (
              <>
                {tr.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
                {tr.pnlOverride !== undefined && <Badge tone="amber">{tx('trades.manualPnl')}</Badge>}
                {(tr.mistakes ?? []).map((m) => (
                  <Badge key={m} tone="red">
                    {mistakeLabel(locale, m)}
                  </Badge>
                ))}
              </>
            ) : (
              <span className="text-[12px] text-dim">{tx('trades.noTags')}</span>
            )}
          </div>
        </DetailSection>

        {setup && checklist.length > 0 && (
          <DetailSection label={tx('modal.checklist', { name: setup.name })} extra={`${doneCount}/${checklist.length}`}>
            <div className="h-1 rounded-full bg-surface-4 overflow-hidden mb-3">
              <div className="h-full rounded-full bg-text/80 transition-all duration-500" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {checklist.map((c) => {
                const ok = done.has(c.id)
                return (
                  <div
                    key={c.id}
                    className={clsx(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[12px]',
                      ok ? 'border-border-2 bg-surface-3/50 text-text' : 'border-border text-dim',
                    )}
                  >
                    <span
                      className={clsx(
                        'w-4 h-4 rounded-[5px] flex items-center justify-center shrink-0',
                        ok ? 'bg-text text-black' : 'border border-border-3',
                      )}
                    >
                      {ok && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="truncate">{c.label}</span>
                  </div>
                )
              })}
            </div>
          </DetailSection>
        )}
      </div>

      <div className="p-5 lg:p-6 border-t lg:border-t-0 lg:border-l border-border bg-surface-2/30 min-w-0">
        <DetailSection label={tx('modal.notes')}>
          <p className="text-[13px] text-text-2 leading-relaxed whitespace-pre-wrap break-words">{tr.notes || <span className="text-dim">{tx('modal.notePh')}</span>}</p>
        </DetailSection>
      </div>
    </div>
  )
}

function DetailSection({ label, extra, children }: { label: string; extra?: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">{label}</div>
        {extra && <div className="num text-[11px] text-muted">{extra}</div>}
      </div>
      {children}
    </section>
  )
}

function Detail({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'green' | 'red' }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted truncate">{label}</div>
      <div className={clsx('mt-1.5 text-[13px] text-text truncate', mono && 'num', tone === 'green' && 'text-accent', tone === 'red' && 'text-loss')}>{value}</div>
    </div>
  )
}
