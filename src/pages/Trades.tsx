import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { ArrowUpDown, ChevronDown, ChevronUp, Copy, Download, ListOrdered, Pencil, Plus, Search, Share2, Trash2, X } from 'lucide-react'
import { useStore } from '@/store'
import { Topbar } from '@/components/Topbar'
import { AssetLogo } from '@/components/AssetLogo'
import { Badge, Button, Confirm, DirectionGlyph, Empty, Input, Pnl, Segmented, Select, Stars } from '@/components/ui'
import { computeStats, tradeDurationMs, tradeOutcome, tradePnl, tradeR, tradeReturnPct, tradeRisk, uniqueValues } from '@/lib/stats'
import { fmtDate, fmtDuration, fmtMoney, fmtPct, fmtPrice, fmtR } from '@/lib/format'
import { exportFile } from '@/lib/db/client'
import type { Trade } from '@/types'
import { tradesToCsv } from '@/lib/csv'
import { useT } from '@/lib/useI18n'
import { marketLabel, emotionLabel, mistakeLabel } from '@/lib/i18n'

type Filter = 'all' | 'wins' | 'losses' | 'open'
type SortKey = 'date' | 'symbol' | 'pnl' | 'r' | 'duration' | 'rating'

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

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  const exportCsv = async () => {
    const ok = await exportFile(tradesToCsv(rows), `operaciones-${new Date().toISOString().slice(0, 10)}.csv`, [{ name: 'CSV', extensions: ['csv'] }])
    if (ok) toast(tx('trades.exported', { n: rows.length }), 'success')
  }

  const Th = ({ k, children, align = 'left', className }: { k?: SortKey; children?: React.ReactNode; align?: 'left' | 'right'; className?: string }) => (
    <th className={clsx('font-medium px-2.5 py-2.5 text-[11px] uppercase tracking-wider text-dim select-none whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left', className)}>
      {k ? (
        <button onClick={() => toggleSort(k)} className={clsx('inline-flex items-center gap-1 hover:text-text transition-colors', sortKey === k && 'text-text')}>
          {children}
          {sortKey === k ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : <ArrowUpDown size={11} className="opacity-50" />}
        </button>
      ) : (
        children
      )}
    </th>
  )

  return (
    <>
      <Topbar
        title={tx('trades.title')}
        subtitle={
          trades.length ? (
            <span className="inline-flex items-center gap-1.5">
              {trades.length}
              <span className="text-border-3">·</span>
              <Pnl value={allStats.netPnl}>{fmtMoney(allStats.netPnl, settings.currency, { sign: true })}</Pnl>
              <span className="text-border-3">·</span>
              <span>
                <span className="text-accent">{allStats.wins}W</span>
                <span className="text-dim"> / </span>
                <span className="text-loss">{allStats.losses}L</span>
              </span>
              {allStats.open > 0 && (
                <>
                  <span className="text-border-3">·</span>
                  <span>{allStats.open} abiertas</span>
                </>
              )}
            </span>
          ) : (
            tx('trades.none')
          )
        }
      />

      <div className="page-stage animate-fade-in">
        <div className="card flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="px-5 py-4 flex flex-col gap-3.5 border-b border-border shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
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
              <div className="relative flex-1 min-w-40 max-w-xs">
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
              <div className="w-32 shrink-0">
                <Select
                  value={market}
                  onChange={setMarket}
                  placeholder={tx('trades.market')}
                  options={[{ value: '', label: tx('common.allM') }, ...markets.map((m) => ({ value: m, label: marketLabel(locale, m as import('@/types').Market) }))]}
                />
              </div>
              <div className="w-36 shrink-0">
                <Select
                  value={strategy}
                  onChange={setStrategy}
                  placeholder={tx('trades.strategy')}
                  options={[{ value: '', label: tx('common.all') }, ...strategies.map((m) => ({ value: m, label: m }))]}
                />
              </div>
              {isFiltered && (
                <div className="text-right shrink-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{tx('trades.view')}</div>
                  <Pnl value={total} className="text-[15px] font-semibold tracking-tight">
                    {fmtMoney(total, settings.currency, { sign: true })}
                  </Pnl>
                  <div className="text-[11px] text-dim mt-0.5">
                    <span className="text-accent num">{view.wins}W</span>
                    <span className="text-dim"> / </span>
                    <span className="text-loss num">{view.losses}L</span>
                  </div>
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
            </div>
          </div>

          {rows.length ? (
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr>
                    <Th k="date" className="pl-5">{tx('trades.date')}</Th>
                    <Th k="symbol">{tx('trades.instrument')}</Th>
                    <Th align="right">{tx('trades.entry')}</Th>
                    <Th align="right">{tx('trades.exit')}</Th>
                    <Th align="right">{tx('trades.size')}</Th>
                    <Th k="pnl" align="right">P&L</Th>
                    <Th k="r" align="right">R</Th>
                    <Th>{tx('trades.strategy')}</Th>
                    <Th className="pr-5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const pnl = tradePnl(t)
                    const r = tradeR(t)
                    const open = t.status === 'OPEN'
                    const isExp = expanded === t.id
                    return (
                      <FragmentRow key={t.id}>
                        <tr
                          className={clsx('group hover:bg-surface-2 cursor-pointer transition-colors', isExp && 'bg-surface-2')}
                          onClick={() => setExpanded(isExp ? null : t.id)}
                          onDoubleClick={() => openTradeModal(t)}
                        >
                          <td className="pl-5 pr-2.5 py-3.5 border-t border-border whitespace-nowrap">
                            <div className="num text-[13px]">{fmtDate(t.exitDate ?? t.entryDate, 'dd MMM yyyy')}</div>
                            <div className="num text-[11px] text-dim">{fmtDate(t.entryDate, 'HH:mm')}{t.exitDate ? ` → ${fmtDate(t.exitDate, 'HH:mm')}` : ''}</div>
                          </td>
                          <td className="px-2.5 py-3.5 border-t border-border whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <DirectionGlyph direction={t.direction} />
                              <AssetLogo ticker={t.symbol} size="sm" />
                              <div>
                                <div className="font-semibold mono text-[13px] leading-tight">{t.symbol}</div>
                                <div className="text-[11px] text-dim leading-tight">{t.market}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2.5 py-3.5 border-t border-border text-right mono text-[13px] whitespace-nowrap">{fmtPrice(t.entryPrice)}</td>
                          <td className="px-2.5 py-3.5 border-t border-border text-right mono text-[13px] text-muted whitespace-nowrap">{open ? '—' : fmtPrice(t.exitPrice)}</td>
                          <td className="px-2.5 py-3.5 border-t border-border text-right mono text-[13px] text-muted whitespace-nowrap">
                            {t.quantity}
                            {t.multiplier !== 1 && <span className="text-dim text-[11px]"> ×{t.multiplier >= 1000 ? `${t.multiplier / 1000}k` : t.multiplier}</span>}
                          </td>
                          <td className="px-2.5 py-3.5 border-t border-border text-right whitespace-nowrap">
                            {open ? (
                              <Badge tone="sky" dot>{tx('trades.openBadge')}</Badge>
                            ) : (
                              <Pnl value={pnl} className="font-semibold text-[13px]">
                                {fmtMoney(pnl, settings.currency, { sign: true })}
                              </Pnl>
                            )}
                          </td>
                          <td className={clsx('px-2.5 py-3.5 border-t border-border text-right num text-[13px] whitespace-nowrap', r === null ? 'text-dim' : r >= 0 ? 'text-accent' : 'text-loss')}>{fmtR(r)}</td>
                          <td className="px-2.5 py-3.5 border-t border-border max-w-44">
                            <div className="text-[13px] text-text-2 truncate">{t.strategy || <span className="text-dim">—</span>}</div>
                            {t.rating > 0 && <Stars value={t.rating} size={10} />}
                          </td>
                          <td className="pl-2 pr-3 py-3.5 border-t border-border text-right w-28">
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
                              <IconBtn title={tx('trades.duplicate')} onClick={() => { duplicateTrade(t.id); toast(tx('trades.duplicated'), 'success') }}>
                                <Copy size={13} />
                              </IconBtn>
                              <IconBtn title={tx('common.delete')} danger onClick={() => setToDelete(t)}>
                                <Trash2 size={13} />
                              </IconBtn>
                            </div>
                          </td>
                        </tr>
                        {isExp && (
                          <tr className="bg-surface-2">
                            <td colSpan={9} className="px-5 pb-4 pt-0">
                              <TradeDetails t={t} />
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
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
                !trades.length && (
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

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
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
  const setup = (settings.playbook ?? []).find((s) => s.id === tr.setupId)
  const done = new Set(tr.checklistDone ?? [])
  return (
    <div className="grid grid-cols-[1fr_1.4fr] gap-6 pt-1 animate-fade-in">
      <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-xs">
        <Detail label={tx('modal.direction')} value={tr.direction === 'NONE' ? tx('common.none') : tr.direction === 'SHORT' ? tx('dir.short') : tx('dir.long')} />
        <Detail label={tx('modal.stop')} value={tr.stopLoss !== undefined ? fmtPrice(tr.stopLoss) : tx('common.none')} mono />
        <Detail label={tx('modal.tp')} value={tr.takeProfit !== undefined ? fmtPrice(tr.takeProfit) : tx('common.none')} mono />
        <Detail label={tx('modal.risk1r')} value={risk ? fmtMoney(risk, settings.currency) : tx('common.none')} mono />
        <Detail label={tx('trades.return')} value={ret !== null ? fmtPct(ret, 2, { sign: true }) : tx('common.none')} mono tone={ret !== null ? (ret >= 0 ? 'green' : 'red') : undefined} />
        <Detail label={tx('modal.fees')} value={fmtMoney(tr.fees, settings.currency)} mono />
        <Detail label={tx('an.duration')} value={fmtDuration(tradeDurationMs(tr))} mono />
        <Detail label={tx('modal.emotion')} value={tr.emotion ? emotionLabel(locale, tr.emotion) : tx('common.none')} />
        <Detail label={tx('modal.setup')} value={setup?.name ?? tx('common.none')} />
        <div className="col-span-3 flex items-center gap-1.5 flex-wrap pt-1">
          {tr.tags.length ? tr.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <span className="text-dim">{tx('trades.noTags')}</span>}
          {tr.pnlOverride !== undefined && <Badge tone="amber">{tx('trades.manualPnl')}</Badge>}
          {(tr.mistakes ?? []).map((m) => (
            <Badge key={m} tone="red">
              {mistakeLabel(locale, m)}
            </Badge>
          ))}
        </div>
        {setup?.checklist.length ? (
          <div className="col-span-3 text-[12px] text-muted space-y-1">
            {setup.checklist.map((c) => (
              <div key={c.id} className={clsx(done.has(c.id) ? 'text-text' : 'text-dim')}>
                {done.has(c.id) ? '✓' : '○'} {c.label}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-dim font-semibold mb-1.5">{tx('modal.notes')}</div>
        <p className="text-[13px] text-text-2 leading-relaxed whitespace-pre-wrap">{tr.notes || <span className="text-dim">{tx('modal.notePh')}</span>}</p>
      </div>
    </div>
  )
}

function Detail({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'green' | 'red' }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-dim font-semibold">{label}</div>
      <div className={clsx('mt-0.5 text-[13px]', mono && 'mono', tone === 'green' && 'text-accent', tone === 'red' && 'text-loss')}>{value}</div>
    </div>
  )
}
