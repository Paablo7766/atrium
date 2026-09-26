import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, ChevronDown, Minus, Share2, Trash2 } from 'lucide-react'
import { useStore } from '@/store'
import { DEFAULT_MISTAKES, EMOTIONS, MARKETS, orderedMarketOptions, type Direction, type Emotion, type Market, type PlaybookSetup, type Trade, type TradeFormMode, type TradeStatus } from '@/types'
import { Button, Field, Input, Modal, Pnl, Segmented, Select, Stars, Textarea, Confirm } from './ui'
import { AssetLogo } from './AssetLogo'
import { fmtMoney, fmtR, fromLocalInputValue, toLocalInputValue, todayKey } from '@/lib/format'
import { useT, useLocale } from '@/lib/useI18n'
import { directionLabel, emotionLabel, marketLabel, mistakeLabel, type AppLocale } from '@/lib/i18n'
import { dailyPnl, tradePnl, tradeR, tradeRisk, uniqueValues } from '@/lib/stats'
import { accountEquity, suggestedQuantity } from '@/lib/capital'
import { INSTRUMENT_PRESETS, presetForSymbol } from '@/lib/instruments'

interface Form {
  symbol: string
  market: Market
  direction: Direction
  status: TradeStatus
  entryDate: string
  exitDate: string
  entryPrice: string
  exitPrice: string
  quantity: string
  multiplier: string
  fees: string
  stopLoss: string
  takeProfit: string
  strategy: string
  tags: string
  notes: string
  rating: number
  emotion: Emotion | ''
  usePnlOverride: boolean
  pnlOverride: string
  setupId: string
  checklistDone: string[]
  mistakes: string[]
}

const num = (v: string): number | undefined => {
  if (v.trim() === '') return undefined
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

const MODE_META: Record<TradeFormMode, { subtitleKey: 'modal.simpleSub' | 'modal.premiumSub'; width: string }> = {
  simple: { subtitleKey: 'modal.simpleSub', width: 'max-w-[520px]' },
  premium: { subtitleKey: 'modal.premiumSub', width: 'max-w-[560px]' },
}

function nowLocal(offsetDate?: string) {
  const d = offsetDate ? new Date(`${offsetDate}T09:30:00`) : new Date()
  return toLocalInputValue(d.toISOString())
}

function toForm(t?: Trade, presetDate?: string, defaults?: { market: Trade['market']; fees: string }): Form {
  const computed = t ? tradePnl(t) : undefined
  return {
    symbol: t?.symbol ?? '',
    market: t?.market ?? defaults?.market ?? 'Futuros',
    direction: t?.direction ?? 'NONE',
    status: t?.status ?? 'CLOSED',
    entryDate: toLocalInputValue(t?.entryDate) || nowLocal(presetDate),
    exitDate: toLocalInputValue(t?.exitDate) || (t ? '' : nowLocal(presetDate)),
    entryPrice: t ? String(t.entryPrice) : '',
    exitPrice: t?.exitPrice !== undefined ? String(t.exitPrice) : '',
    quantity: t ? String(t.quantity) : '1',
    multiplier: t ? String(t.multiplier) : '1',
    fees: t ? String(t.fees) : (defaults?.fees ?? '0'),
    stopLoss: t?.stopLoss !== undefined ? String(t.stopLoss) : '',
    takeProfit: t?.takeProfit !== undefined ? String(t.takeProfit) : '',
    strategy: t?.strategy ?? '',
    tags: t?.tags.join(', ') ?? '',
    notes: t?.notes ?? '',
    rating: t?.rating ?? 0,
    emotion: t?.emotion ?? '',
    usePnlOverride: t?.pnlOverride !== undefined,
    pnlOverride:
      t?.pnlOverride !== undefined ? String(t.pnlOverride) : computed !== undefined && t?.status === 'CLOSED' ? String(computed) : '',
    setupId: t?.setupId ?? '',
    checklistDone: t?.checklistDone ?? [],
    mistakes: t?.mistakes ?? [],
  }
}

export function TradeModal() {
  const { open, trade, presetDate } = useStore((s) => s.tradeModal)
  const close = useStore((s) => s.closeTradeModal)
  const openShareCard = useStore((s) => s.openShareCard)
  const addTrade = useStore((s) => s.addTrade)
  const updateTrade = useStore((s) => s.updateTrade)
  const deleteTrade = useStore((s) => s.deleteTrade)
  const trades = useStore((s) => s.trades)
  const cashflows = useStore((s) => s.cashflows)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const toast = useStore((s) => s.toast)
  const tx = useT()
  const locale = settings.locale ?? 'es'

  const [f, setF] = useState<Form>(() => toForm(trade, presetDate, { market: settings.defaultMarket, fees: String(settings.defaultFees) }))
  const [baseline, setBaseline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [mode, setMode] = useState<TradeFormMode>(settings.tradeFormMode)

  useEffect(() => {
    if (open) {
      const next = toForm(trade, presetDate, { market: settings.defaultMarket, fees: String(settings.defaultFees ?? 0) })
      setF(next)
      setBaseline(JSON.stringify(next))
      setError(null)
      setConfirmDiscard(false)
      setMode(settings.tradeFormMode)
    }
  }, [open, trade, presetDate, settings.tradeFormMode, settings.defaultMarket, settings.defaultFees])

  const strategies = useMemo(() => uniqueValues(trades, (t) => t.strategy), [trades])
  const symbols = useMemo(() => uniqueValues(trades, (t) => t.symbol), [trades])
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }))
  const setSymbol = (raw: string) => {
    const symbol = raw.toUpperCase()
    setF((s) => {
      const p = presetForSymbol(symbol)
      if (!p) return { ...s, symbol }
      return {
        ...s,
        symbol,
        market: p.market,
        multiplier: !trade || Number(s.multiplier) === 1 ? String(p.multiplier) : s.multiplier,
        fees: !trade || Number(s.fees) === 0 ? String(p.fees) : s.fees,
      }
    })
  }

  const preview = useMemo(() => {
    const draft: Trade = {
      id: 'preview',
      symbol: f.symbol,
      market: f.market,
      direction: f.direction,
      status: f.status,
      entryDate: fromLocalInputValue(f.entryDate) ?? new Date().toISOString(),
      exitDate: fromLocalInputValue(f.exitDate),
      entryPrice: num(f.entryPrice) ?? 0,
      exitPrice: num(f.exitPrice),
      quantity: num(f.quantity) ?? 0,
      multiplier: num(f.multiplier) ?? 1,
      fees: num(f.fees) ?? 0,
      stopLoss: num(f.stopLoss),
      takeProfit: num(f.takeProfit),
      strategy: f.strategy,
      tags: [],
      notes: '',
      rating: 0,
      pnlOverride: mode === 'simple' || f.usePnlOverride ? num(f.pnlOverride) : undefined,
      setupId: f.setupId || undefined,
      checklistDone: f.checklistDone,
      mistakes: f.mistakes,
      createdAt: '',
      updatedAt: '',
    }
    const risk = tradeRisk(draft)
    const plannedR =
      risk && draft.takeProfit !== undefined
        ? (Math.abs(draft.takeProfit - draft.entryPrice) * draft.quantity * draft.multiplier) / risk
        : null
    return { pnl: tradePnl(draft), r: tradeR(draft), risk, plannedR }
  }, [f, mode])

  const changeMode = (next: TradeFormMode) => {
    setMode(next)
    updateSettings({ tradeFormMode: next })
    setError(null)
    if (next === 'simple' && f.status === 'CLOSED') {
      setF((s) => {
        if (s.pnlOverride.trim() !== '') return { ...s, usePnlOverride: true }
        return { ...s, usePnlOverride: true, pnlOverride: preview.pnl ? String(preview.pnl) : s.pnlOverride }
      })
    }
    if (next === 'premium') {
      setF((s) => {
        const hasPrices = num(s.entryPrice) !== undefined
        const fees = s.fees === '' || s.fees === '0' ? String(settings.defaultFees ?? 0) : s.fees
        if (hasPrices) return { ...s, usePnlOverride: false, fees }
        if (s.status === 'CLOSED' && s.pnlOverride.trim() !== '') return { ...s, usePnlOverride: true, fees }
        return { ...s, fees }
      })
    }
  }

  const submit = () => {
    const quantity = num(f.quantity)
    const entryDate = fromLocalInputValue(f.entryDate)
    if (!f.symbol.trim()) return setError(tx('modal.err.symbol'))
    if (!entryDate) return setError(tx('modal.err.entryDate'))

    if (mode === 'simple') {
      if (f.status === 'CLOSED' && num(f.pnlOverride) === undefined) return setError(tx('modal.err.pnl'))
    } else {
      const entryPrice = num(f.entryPrice)
      if (entryPrice === undefined || entryPrice <= 0) return setError(tx('modal.err.entryPrice'))
      if (quantity === undefined || quantity <= 0) return setError(tx('modal.err.qty'))
      if (f.status === 'CLOSED') {
        if (!f.usePnlOverride && num(f.exitPrice) === undefined) return setError(tx('modal.err.exit'))
        if (f.usePnlOverride && num(f.pnlOverride) === undefined) return setError(tx('modal.err.manual'))
        if (!f.usePnlOverride && f.direction === 'NONE') return setError(tx('modal.err.side'))
      }
    }

    const exitDate = f.status === 'CLOSED' ? fromLocalInputValue(f.exitDate) ?? entryDate : undefined
    if (exitDate && new Date(exitDate) < new Date(entryDate)) return setError(tx('modal.err.order'))

    const simpleClosed = mode === 'simple' && f.status === 'CLOSED'
    const typedEntry = num(f.entryPrice)
    const hasRealEntry = typedEntry !== undefined && typedEntry > 0
    const keptEntry = trade?.entryPrice && trade.entryPrice > 0 ? trade.entryPrice : 0
    const resolvedEntry = hasRealEntry ? typedEntry : keptEntry
    const resolvedStop = num(f.stopLoss)

    const payload: Omit<Trade, 'id' | 'createdAt' | 'updatedAt'> = {
      symbol: f.symbol.trim().toUpperCase(),
      market: f.market,
      direction: f.direction,
      status: f.status,
      entryDate,
      exitDate,
      entryPrice: resolvedEntry,
      exitPrice: f.status === 'CLOSED' ? num(f.exitPrice) ?? trade?.exitPrice : undefined,
      quantity: quantity !== undefined && quantity > 0 ? quantity : trade?.quantity ?? 1,
      multiplier: num(f.multiplier) ?? trade?.multiplier ?? 1,
      fees: mode === 'simple' ? (trade?.fees ?? 0) : (num(f.fees) ?? trade?.fees ?? 0),
      stopLoss: hasRealEntry || mode !== 'simple' ? resolvedStop ?? trade?.stopLoss : undefined,
      takeProfit: num(f.takeProfit) ?? trade?.takeProfit,
      strategy: f.strategy.trim(),
      tags: f.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: f.notes.trim(),
      rating: f.rating,
      emotion: f.emotion || undefined,
      pnlOverride: simpleClosed || (f.status === 'CLOSED' && f.usePnlOverride) ? num(f.pnlOverride) : undefined,
      setupId: f.setupId || undefined,
      checklistDone: f.checklistDone,
      mistakes: f.mistakes,
    }

    if (trade) {
      updateTrade(trade.id, payload)
      toast(tx('modal.updated'), 'success')
    } else {
      addTrade(payload)
      toast(tx('modal.created'), 'success')
    }
    setConfirmDiscard(false)
    close()
  }

  const dirty = JSON.stringify(f) !== baseline
  const requestClose = () => {
    if (confirmDel || confirmDiscard) return
    if (dirty) setConfirmDiscard(true)
    else close()
  }

  const isClosed = f.status === 'CLOSED'
  const playbook = settings.playbook ?? []
  const equity = accountEquity(settings.startingBalance, trades, cashflows)
  const todayAgg = useMemo(() => dailyPnl(trades).get(todayKey()), [trades])
  const lossLimitHit = settings.dailyLossLimit > 0 && !!todayAgg && todayAgg.pnl <= -settings.dailyLossLimit
  const mistakePool = useMemo(() => {
    const set = new Set<string>(DEFAULT_MISTAKES)
    for (const t of trades) for (const m of t.mistakes ?? []) if (m) set.add(m)
    for (const m of f.mistakes) if (m) set.add(m)
    return [...set]
  }, [trades, f.mistakes])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, f, mode, trade])

  const glow = !isClosed ? 'neutral' : preview.pnl > 0 ? 'gain' : preview.pnl < 0 ? 'loss' : 'neutral'
  const logoTicker = useDebounced(f.symbol.trim(), 450)
  const headerLine = f.symbol.trim() ? (
    <span className="inline-flex items-center gap-2 max-w-full min-w-0 align-middle">
      {logoTicker && <AssetLogo ticker={logoTicker} size="xs" />}
      <span className="mono font-semibold text-text truncate">{f.symbol.trim().toUpperCase()}</span>
      <span className="text-dim">·</span>
      <span className="truncate">{marketLabel(locale, f.market)}</span>
      {f.direction !== 'NONE' && (
        <>
          <span className="text-dim">·</span>
          <span className={clsx('shrink-0', f.direction === 'LONG' ? 'text-accent' : 'text-loss')}>{directionLabel(locale, f.direction)}</span>
        </>
      )}
    </span>
  ) : (
    tx(MODE_META[mode].subtitleKey)
  )

  const fieldProps = {
    f,
    set,
    setSymbol,
    symbols,
    currency: settings.currency,
    isClosed,
    playbook,
    mistakes: mistakePool,
    preferredMarkets: settings.preferredMarkets,
  }

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        glow={glow}
        title={
          <span className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-dim mb-1.5">{tx('modal.kicker')}</span>
            <span className="text-gradient">{trade ? tx('modal.edit') : tx('modal.new')}</span>
          </span>
        }
        subtitle={headerLine}
        width={MODE_META[mode].width}
        className="!rounded-[22px] !max-h-[min(90vh,800px)]"
        action={
          <Segmented
            size="sm"
            value={mode}
            onChange={changeMode}
            className="shrink-0"
            options={[
              { value: 'simple', label: tx('modal.simple') },
              { value: 'premium', label: tx('modal.premium') },
            ]}
          />
        }
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className={clsx('min-w-0 flex-wrap items-center gap-1', trade || error ? 'flex' : 'hidden sm:flex')}>
              {trade && (
                <Button variant="ghost" size="sm" className="hover:text-loss hover:bg-loss/10" onClick={() => setConfirmDel(true)}>
                  <Trash2 size={14} /> {tx('common.delete')}
                </Button>
              )}
              {trade && trade.status === 'CLOSED' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    openShareCard({ kind: 'trade', tradeId: trade.id })
                  }}
                >
                  <Share2 size={14} /> {tx('modal.card')}
                </Button>
              )}
              {error ? (
                <p
                  role="alert"
                  className="ml-1 min-w-0 max-w-full rounded-lg border border-loss/20 bg-loss/[0.07] px-2.5 py-1 text-[12px] leading-snug text-loss animate-field-in"
                >
                  {error}
                </p>
              ) : (
                <p className="ml-1 hidden text-[11px] text-dim sm:block">{tx('modal.ctrlEnter')}</p>
              )}
            </div>
            <div className="flex items-center gap-2 sm:shrink-0">
              <Button variant="ghost" onClick={requestClose} className="flex-1 sm:flex-none">
                {tx('common.cancel')}
              </Button>
              <Button variant="primary" size="lg" onClick={submit} className="flex-[2] sm:flex-none sm:min-w-[140px]">
                {trade ? tx('modal.save') : tx('modal.register')}
              </Button>
            </div>
          </div>
        }
      >
        <div key={mode} className="@container min-w-0">
          {lossLimitHit && (
            <div className="mb-3 flex items-start gap-3 rounded-2xl border border-loss/20 bg-loss/[0.06] px-4 py-3 text-[12px] leading-relaxed animate-field-in">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-loss" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-loss">{tx('modal.dailyLimit')}</div>
                <p className="mt-0.5 text-text-2">
                  {tx('modal.dailyLimitBody', {
                    pnl: fmtMoney(todayAgg!.pnl, settings.currency, { sign: true }),
                    limit: fmtMoney(-settings.dailyLossLimit, settings.currency),
                  })}
                </p>
              </div>
            </div>
          )}
          {mode === 'simple' && <SimpleFields {...fieldProps} previewR={preview.r} />}
          {mode === 'premium' && (
            <PremiumFields
              {...fieldProps}
              strategies={strategies}
              preview={preview}
              riskPerTrade={settings.riskPerTrade}
              equity={equity}
            />
          )}
        </div>
      </Modal>

      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          if (trade) {
            deleteTrade(trade.id)
            toast(tx('modal.deleted'), 'info')
            close()
          }
        }}
        title={tx('modal.deleteTitle')}
        message={tx('modal.deleteMsg')}
      />
      <Confirm
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          close()
        }}
        title={tx('modal.discardTitle')}
        message={tx('modal.discardMsg')}
        confirmLabel={tx('modal.discard')}
      />
    </>
  )
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

const CONTROL = 'h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-white/25'
const SELECT = '[&>button]:h-11'
const HERO_INPUT = 'h-12 px-4 text-[19px] font-semibold tracking-tight rounded-xl focus-visible:border-white/30 focus-visible:ring-1 focus-visible:ring-white/25'
const INSET = 'shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]'

type FieldsBase = {
  f: Form
  set: <K extends keyof Form>(k: K, v: Form[K]) => void
  setSymbol: (raw: string) => void
  symbols: string[]
  currency: 'USD' | 'EUR' | 'GBP'
  isClosed: boolean
  playbook: PlaybookSetup[]
  mistakes: string[]
  preferredMarkets?: Market[]
}

function InstrumentFields({
  f,
  set,
  setSymbol,
  symbols,
  preferredMarkets,
  label,
  placeholder,
  listId,
}: Pick<FieldsBase, 'f' | 'set' | 'setSymbol' | 'symbols' | 'preferredMarkets'> & { label: string; placeholder: string; listId: string }) {
  const tx = useT()
  return (
    <>
      <div className="grid grid-cols-1 gap-3 items-end @sm:grid-cols-[minmax(0,1fr)_148px]">
        <Field label={label}>
          <Input list={listId} value={f.symbol} onChange={(e) => setSymbol(e.target.value)} placeholder={placeholder} mono autoFocus className={HERO_INPUT} />
          <datalist id={listId}>
            {symbols.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label={tx('modal.market')}>
          <MarketSelect value={f.market} preferred={preferredMarkets} onChange={(m) => set('market', m)} className="[&>button]:h-12" />
        </Field>
      </div>
      <PresetRow symbol={f.symbol} onPick={setSymbol} />
    </>
  )
}

function SimpleFields({ f, set, setSymbol, symbols, currency, isClosed, playbook, mistakes, previewR, preferredMarkets }: FieldsBase & { previewR: number | null }) {
  const tx = useT()
  const locale = useLocale()
  const pnl = num(f.pnlOverride)
  const dateValue = f.entryDate.slice(0, 10)
  const setDate = (date: string) => {
    const time = f.entryDate.slice(11) || '09:30'
    const next = `${date}T${time}`
    set('entryDate', next)
    if (isClosed && (!f.exitDate || f.exitDate.slice(0, 10) === f.entryDate.slice(0, 10))) {
      set('exitDate', next)
    }
  }
  const extra = [f.entryPrice, f.stopLoss, f.strategy, f.emotion, f.notes, f.setupId, ...f.mistakes].filter((v) => String(v).trim()).length

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <Panel label={tx('modal.theTrade')} delay={20}>
        <InstrumentFields
          f={f}
          set={set}
          setSymbol={setSymbol}
          symbols={symbols}
          preferredMarkets={preferredMarkets}
          label={tx('modal.what')}
          placeholder={tx('modal.whatPh')}
          listId="symbols-simple"
        />
      </Panel>

      <Panel label={tx('modal.sideWhen')} delay={50}>
        <Field label={tx('modal.direction')}>
          <DirectionPick value={f.direction} onChange={(d) => set('direction', d)} />
        </Field>
        <div className="mt-4 grid grid-cols-1 gap-3 @sm:grid-cols-2">
          <Field label={tx('modal.when')}>
            <Input type="date" value={dateValue} onChange={(e) => setDate(e.target.value)} className={CONTROL} />
          </Field>
          <Field label={tx('modal.status')}>
            <StatusToggle value={f.status} onChange={(s) => set('status', s)} full />
          </Field>
        </div>
      </Panel>

      {isClosed ? (
        <PnlPad pnl={pnl} currency={currency} r={previewR} value={f.pnlOverride} onChange={(v) => set('pnlOverride', v)} />
      ) : (
        <OpenNote />
      )}

      <Fold title={tx('modal.context')} hint={tx('modal.contextHint')} badge={extra ? String(extra) : undefined} defaultOpen={extra > 0} delay={110}>
        <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
          <Field label={tx('modal.entryPrice')}>
            <Input mono inputMode="decimal" value={f.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} placeholder="—" className={CONTROL} />
          </Field>
          <Field label={tx('modal.stop')}>
            <Input
              mono
              inputMode="decimal"
              value={f.stopLoss}
              onChange={(e) => set('stopLoss', e.target.value)}
              placeholder="—"
              disabled={!num(f.entryPrice)}
              className={CONTROL}
            />
          </Field>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-dim">{f.stopLoss && !num(f.entryPrice) ? tx('modal.stopNeedEntry') : tx('modal.entryPriceHintOpt')}</p>
        <div className="mt-4 grid grid-cols-1 gap-3 @sm:grid-cols-2">
          <Field label={tx('trades.strategy')} hint={tx('modal.strategyHint')}>
            <Input value={f.strategy} onChange={(e) => set('strategy', e.target.value)} placeholder={tx('modal.strategyPh')} className={CONTROL} />
          </Field>
          <Field label={tx('modal.emotion')}>
            <EmotionSelect value={f.emotion} onChange={(v) => set('emotion', v)} locale={locale} />
          </Field>
        </div>
        <SubBlock label={tx('modal.process')}>
          <ProcessFields f={f} set={set} playbook={playbook} mistakes={mistakes} />
        </SubBlock>
        <SubBlock label={tx('modal.note')}>
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder={tx('modal.notePh')} className="min-h-[76px] rounded-xl" />
        </SubBlock>
      </Fold>
    </div>
  )
}

function PremiumFields({
  f,
  set,
  setSymbol,
  symbols,
  strategies,
  currency,
  isClosed,
  playbook,
  mistakes,
  preview,
  preferredMarkets,
  riskPerTrade,
  equity,
}: FieldsBase & {
  strategies: string[]
  preview: { pnl: number; r: number | null; risk: number | null; plannedR: number | null }
  riskPerTrade: number
  equity: number
}) {
  const processExtra = [f.setupId, ...f.mistakes, ...f.checklistDone].filter((v) => String(v).trim()).length
  const sizeExtra = [f.quantity !== '1' ? f.quantity : '', f.multiplier !== '1' ? f.multiplier : '', f.stopLoss, f.takeProfit].filter((v) => String(v).trim()).length
  const contextExtra = [f.strategy, f.tags, f.emotion, f.notes, f.rating > 0 ? '1' : ''].filter((v) => String(v).trim()).length
  const shownPnl = f.usePnlOverride ? num(f.pnlOverride) : isClosed ? preview.pnl : undefined
  const size = suggestedQuantity({
    equity,
    riskPct: riskPerTrade,
    entry: num(f.entryPrice) ?? 0,
    stop: num(f.stopLoss) ?? 0,
    multiplier: num(f.multiplier) ?? 1,
  })
  const riskPct = preview.risk && equity > 0 ? (preview.risk / equity) * 100 : null
  const riskWarn = riskPct !== null && riskPerTrade > 0 && riskPct > riskPerTrade
  const tx = useT()
  const locale = useLocale()

  const resultRef = useRef<HTMLDivElement>(null)
  const [resultOut, setResultOut] = useState(false)
  useEffect(() => {
    const el = resultRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const root = el.closest<HTMLElement>('.overflow-y-auto')
    const io = new IntersectionObserver(
      ([e]) => {
        const top = e.rootBounds?.top ?? 0
        setResultOut(!e.isIntersecting && e.boundingClientRect.bottom <= top + 1)
      },
      { root, rootMargin: '-40px 0px 0px 0px', threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const metrics: { label: string; value: string; warn?: boolean }[] = []
  if (preview.risk) metrics.push({ label: tx('modal.risk1r'), value: fmtMoney(preview.risk, currency) })
  if (riskPct !== null) metrics.push({ label: tx('modal.acctPct'), value: `${riskPct.toFixed(2)}%`, warn: riskWarn })
  if (preview.plannedR) metrics.push({ label: tx('modal.plannedR'), value: `${preview.plannedR.toFixed(2)}R` })

  return (
    <div className="relative flex flex-col gap-3 min-w-0">
      <div className="sticky -top-4 z-20 -mb-3 h-0">
        <div
          aria-hidden={!resultOut}
          className={clsx(
            'absolute right-0 top-0 inline-flex h-8 items-center gap-2 rounded-full border border-border-2 bg-surface-2/95 px-3 text-[12px] backdrop-blur-md shadow-[0_12px_32px_-10px_rgba(0,0,0,0.9)] transition-all duration-300',
            resultOut && isClosed && shownPnl !== undefined ? 'opacity-100 translate-y-0' : 'pointer-events-none -translate-y-1 opacity-0',
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">{tx('modal.result')}</span>
          <Pnl value={shownPnl ?? 0} neutralZero={false} className="font-semibold">
            {fmtMoney(shownPnl ?? 0, currency, { sign: true })}
          </Pnl>
          {preview.r !== null && <span className="num text-muted">{fmtR(preview.r)}</span>}
        </div>
      </div>

      <Panel label={tx('modal.instrument')} delay={20}>
        <InstrumentFields
          f={f}
          set={set}
          setSymbol={setSymbol}
          symbols={symbols}
          preferredMarkets={preferredMarkets}
          label={tx('modal.symbol')}
          placeholder={tx('modal.symbolPh2')}
          listId="symbols-premium"
        />
        <Field label={tx('modal.direction')} className="mt-4">
          <DirectionPick value={f.direction} onChange={(d) => set('direction', d)} />
        </Field>
      </Panel>

      <Panel label={tx('modal.execution')} delay={50} extra={<StatusToggle value={f.status} onChange={(s) => set('status', s)} />}>
        <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
          <Field label={tx('modal.entry')}>
            <Input type="datetime-local" value={f.entryDate} onChange={(e) => set('entryDate', e.target.value)} className={CONTROL} />
          </Field>
          <Field label={tx('modal.exit')}>
            <Input type="datetime-local" value={f.exitDate} onChange={(e) => set('exitDate', e.target.value)} disabled={!isClosed} className={CONTROL} />
          </Field>
          <Field label={tx('modal.entryPrice')}>
            <Input mono inputMode="decimal" value={f.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} placeholder="0.00" className={CONTROL} />
          </Field>
          <Field label={tx('modal.exitPrice')}>
            <Input
              mono
              inputMode="decimal"
              value={f.exitPrice}
              onChange={(e) => set('exitPrice', e.target.value)}
              placeholder="0.00"
              disabled={!isClosed || f.usePnlOverride}
              className={CONTROL}
            />
          </Field>
        </div>
      </Panel>

      <div ref={resultRef}>
        <ResultStrip
          isClosed={isClosed}
          pnl={shownPnl}
          r={preview.r}
          currency={currency}
          useOverride={f.usePnlOverride}
          override={f.pnlOverride}
          onToggle={() => set('usePnlOverride', !f.usePnlOverride)}
          onOverride={(v) => set('pnlOverride', v)}
          metrics={metrics}
        />
      </div>

      <Fold title={tx('modal.sizeRisk')} hint={tx('modal.sizeRiskHint')} badge={sizeExtra ? String(sizeExtra) : undefined} defaultOpen={sizeExtra > 0} delay={110}>
        <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
          <Field label={tx('modal.qty')}>
            <Input mono inputMode="decimal" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} className={CONTROL} />
          </Field>
          <Field label={tx('modal.multiplier')} hint={tx('modal.multiplierHint')}>
            <Input mono inputMode="decimal" value={f.multiplier} onChange={(e) => set('multiplier', e.target.value)} className={CONTROL} />
          </Field>
          <Field label={tx('modal.fees')}>
            <Input mono inputMode="decimal" value={f.fees} onChange={(e) => set('fees', e.target.value)} className={CONTROL} />
          </Field>
          <Field label={tx('modal.stop')} hint={tx('modal.stopHint')}>
            <Input mono inputMode="decimal" value={f.stopLoss} onChange={(e) => set('stopLoss', e.target.value)} placeholder="0.00" className={CONTROL} />
          </Field>
          <Field label={tx('modal.tp')}>
            <Input mono inputMode="decimal" value={f.takeProfit} onChange={(e) => set('takeProfit', e.target.value)} placeholder="0.00" className={CONTROL} />
          </Field>
          <div className="flex flex-col justify-end">
            {size ? (
              <button
                type="button"
                onClick={() => set('quantity', String(size.qty))}
                className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-border-2 bg-surface-2 px-3.5 text-left text-[12px] transition-all duration-200 hover:border-border-3 hover:bg-surface-3 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25"
              >
                <span className="truncate text-dim">{tx('modal.sizeLine', { pct: riskPerTrade, money: fmtMoney(size.riskMoney, currency) })}</span>
                <span className="shrink-0 font-semibold text-text">{tx('modal.useSize', { qty: size.qty })}</span>
              </button>
            ) : (
              <div className="flex h-11 w-full items-center rounded-xl border border-dashed border-border px-3.5 text-[12px] text-dim">{tx('modal.stopForR')}</div>
            )}
          </div>
        </div>
      </Fold>

      <Fold title={tx('modal.context')} hint={tx('modal.contextHint2')} badge={contextExtra ? String(contextExtra) : undefined} defaultOpen={contextExtra > 0} delay={140}>
        <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
          <Field label={tx('trades.strategy')}>
            <Input list="strategies-premium" value={f.strategy} onChange={(e) => set('strategy', e.target.value)} placeholder={tx('modal.strategyPh2')} className={CONTROL} />
            <datalist id="strategies-premium">
              {strategies.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label={tx('modal.tags')}>
            <Input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder={tx('modal.tagsPh')} className={CONTROL} />
          </Field>
          <Field label={tx('modal.emotion')}>
            <EmotionSelect value={f.emotion} onChange={(v) => set('emotion', v)} locale={locale} />
          </Field>
          <Field label={tx('modal.rating')}>
            <div className="flex h-11 items-center rounded-xl border border-border bg-surface-2/60 px-3">
              <Stars value={f.rating} onChange={(v) => set('rating', v)} size={20} />
            </div>
          </Field>
        </div>
        <SubBlock label={tx('modal.note')}>
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder={tx('modal.notePh2')} className="min-h-[76px] rounded-xl" />
        </SubBlock>
      </Fold>

      <Fold title={tx('modal.process')} hint={tx('modal.processHint')} badge={processExtra ? String(processExtra) : undefined} defaultOpen={processExtra > 0} delay={170}>
        <ProcessFields f={f} set={set} playbook={playbook} mistakes={mistakes} />
      </Fold>
    </div>
  )
}

function ProcessFields({
  f,
  set,
  playbook,
  mistakes,
}: {
  f: Form
  set: <K extends keyof Form>(k: K, v: Form[K]) => void
  playbook: PlaybookSetup[]
  mistakes: string[]
}) {
  const setup = playbook.find((s) => s.id === f.setupId)
  const pickSetup = (id: string) => {
    const next = playbook.find((s) => s.id === id)
    set('setupId', id)
    set('checklistDone', [])
    if (next && (!f.strategy.trim() || playbook.some((s) => s.name === f.strategy))) {
      set('strategy', next.name)
    }
    if (!id) set('strategy', f.strategy)
  }
  const toggleMistake = (m: string) => {
    set('mistakes', f.mistakes.includes(m) ? f.mistakes.filter((x) => x !== m) : [...f.mistakes, m])
  }
  const toggleCheck = (id: string) => {
    set('checklistDone', f.checklistDone.includes(id) ? f.checklistDone.filter((x) => x !== id) : [...f.checklistDone, id])
  }
  const tx = useT()
  const locale = useLocale()
  const items = setup?.checklist ?? []
  const doneCount = items.filter((c) => f.checklistDone.includes(c.id)).length

  return (
    <div className="flex flex-col gap-4">
      <Field label={tx('modal.setup')} hint={playbook.length ? tx('modal.setupHint') : tx('modal.setupHintEmpty')}>
        <Select
          value={f.setupId}
          onChange={pickSetup}
          placeholder={tx('common.noSetup')}
          className={SELECT}
          options={[{ value: '', label: tx('common.noSetup') }, ...playbook.map((s) => ({ value: s.id, label: s.name }))]}
        />
      </Field>
      {setup && items.length ? (
        <div className="animate-field-in">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="truncate text-[11px] font-medium tracking-wide text-muted">{tx('modal.checklist', { name: setup.name })}</span>
            <span className="num shrink-0 text-[11px] text-muted">
              {doneCount}/{items.length}
            </span>
          </div>
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-surface-4">
            <div className="h-full rounded-full bg-text/80 transition-all duration-500" style={{ width: `${(doneCount / items.length) * 100}%` }} />
          </div>
          <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
            {items.map((item) => {
              const on = f.checklistDone.includes(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggleCheck(item.id)}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[12px] transition-all duration-200 active:scale-[0.99]',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25',
                    on ? 'border-border-2 bg-surface-3/60 text-text' : 'border-border text-muted hover:border-border-2 hover:text-text',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] transition-colors',
                      on ? 'bg-text text-black' : 'border border-border-3',
                    )}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
      <Field label={tx('modal.errors')} hint={tx('modal.errorsHint')}>
        <div className="flex flex-wrap gap-1.5">
          {mistakes.map((m) => {
            const on = f.mistakes.includes(m)
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => toggleMistake(m)}
                className={clsx(
                  'h-7 rounded-full border px-2.5 text-[12px] font-medium transition-all duration-200 active:scale-[0.97]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25',
                  on ? 'border-loss/25 bg-loss/10 text-loss' : 'border-border bg-surface-2 text-muted hover:border-border-2 hover:text-text',
                )}
              >
                {mistakeLabel(locale, m)}
              </button>
            )
          })}
        </div>
      </Field>
    </div>
  )
}

function EmotionSelect({ value, onChange, locale }: { value: Emotion | ''; onChange: (v: Emotion | '') => void; locale: AppLocale }) {
  const tx = useT()
  return (
    <Select
      value={value}
      onChange={(v) => onChange(v as Emotion | '')}
      placeholder={tx('emotion.none')}
      className={SELECT}
      options={[{ value: '', label: tx('emotion.none') }, ...EMOTIONS.map((e) => ({ value: e, label: emotionLabel(locale, e) }))]}
    />
  )
}

function OpenNote() {
  const tx = useT()
  return (
    <div className={clsx('flex items-center gap-3 rounded-2xl border border-sky/20 bg-sky/[0.05] px-4 py-3.5 text-[12px] animate-section-rise', INSET)} style={{ animationDelay: '80ms' }}>
      <LiveDot />
      <span className="font-semibold text-sky">{tx('common.inProgress')}</span>
      <span className="min-w-0 truncate text-muted">{tx('modal.openHint')}</span>
    </div>
  )
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inset-0 rounded-full bg-sky/60 animate-ping-soft" />
      <span className="relative h-2 w-2 rounded-full bg-sky" />
    </span>
  )
}

function resultTone(n: number | undefined) {
  if (n !== undefined && n > 0) return 'border-accent/20 bg-accent/[0.05]'
  if (n !== undefined && n < 0) return 'border-loss/20 bg-loss/[0.05]'
  return 'border-border bg-surface/70'
}

function PnlPad({
  pnl,
  currency,
  r,
  value,
  onChange,
}: {
  pnl: number | undefined
  currency: 'USD' | 'EUR' | 'GBP'
  r: number | null
  value: string
  onChange: (v: string) => void
}) {
  const tx = useT()
  return (
    <section
      className={clsx('rounded-2xl border p-4 @sm:p-5 transition-colors duration-300 animate-section-rise', INSET, resultTone(pnl))}
      style={{ animationDelay: '80ms' }}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">{tx('modal.result')}</h3>
        <div className="flex gap-1.5">
          <ResultChip
            active={pnl !== undefined && pnl > 0}
            tone="green"
            onClick={() => {
              const n = Math.abs(pnl ?? 0)
              onChange(n ? String(n) : '')
            }}
          >
            {tx('modal.gain')}
          </ResultChip>
          <ResultChip
            active={pnl !== undefined && pnl < 0}
            tone="red"
            onClick={() => {
              const n = Math.abs(pnl ?? 0)
              onChange(n ? String(-n) : '-')
            }}
          >
            {tx('modal.loss')}
          </ResultChip>
          <ResultChip active={pnl === 0} tone="neutral" onClick={() => onChange('0')}>
            {tx('modal.be')}
          </ResultChip>
        </div>
      </header>
      <Input
        mono
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tx('modal.pnlPh')}
        className={clsx(
          'num h-14 rounded-xl border-white/[0.06] bg-surface/60 px-4 text-[28px] font-semibold tracking-tight focus-visible:ring-1 focus-visible:ring-white/25',
          pnl !== undefined && pnl > 0 && '!text-accent',
          pnl !== undefined && pnl < 0 && '!text-loss',
        )}
      />
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[11px] text-dim">
          {tx('modal.brokerNet')} · {tx('modal.withFees')}
        </span>
        {pnl !== undefined && (
          <span key={String(pnl)} className="num shrink-0 text-[13px] font-semibold animate-ticker">
            <Pnl value={pnl}>{fmtMoney(pnl, currency, { sign: true })}</Pnl>
            {r !== null && <span className="font-medium text-muted"> · {fmtR(r)}</span>}
          </span>
        )}
      </div>
    </section>
  )
}

function ResultStrip({
  isClosed,
  pnl,
  r,
  currency,
  useOverride,
  override,
  onToggle,
  onOverride,
  metrics,
}: {
  isClosed: boolean
  pnl: number | undefined
  r: number | null
  currency: 'USD' | 'EUR' | 'GBP'
  useOverride: boolean
  override: string
  onToggle: () => void
  onOverride: (v: string) => void
  metrics: { label: string; value: string; warn?: boolean }[]
}) {
  const tx = useT()
  const n = pnl ?? 0
  return (
    <section
      className={clsx(
        'rounded-2xl border p-4 @sm:p-5 transition-colors duration-300 animate-section-rise',
        INSET,
        isClosed ? resultTone(n === 0 ? undefined : n) : 'border-sky/20 bg-sky/[0.04]',
      )}
      style={{ animationDelay: '80ms' }}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        {isClosed ? (
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">{useOverride ? tx('modal.manualPnl') : tx('modal.netPnl')}</h3>
        ) : (
          <h3 className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky">
            <LiveDot />
            {tx('common.inProgress')}
          </h3>
        )}
        {isClosed && (
          <Segmented
            size="sm"
            value={useOverride ? 'manual' : 'calc'}
            onChange={(v) => {
              if ((v === 'manual') !== useOverride) onToggle()
            }}
            options={[
              { value: 'calc', label: tx('modal.calculated') },
              { value: 'manual', label: tx('modal.manual') },
            ]}
          />
        )}
      </header>

      {!isClosed ? (
        <>
          <div className="num mt-2 text-[28px] font-semibold leading-none tracking-tight text-dim">—</div>
          <p className="mt-2 text-[12px] text-muted">{tx('modal.openHint')}</p>
        </>
      ) : useOverride ? (
        <>
          <Input
            mono
            inputMode="decimal"
            value={override}
            onChange={(e) => onOverride(e.target.value)}
            placeholder="0.00"
            autoFocus
            className={clsx(
              'num mt-3 h-14 rounded-xl border-white/[0.06] bg-surface/60 px-4 text-[28px] font-semibold tracking-tight focus-visible:ring-1 focus-visible:ring-white/25',
              n > 0 && '!text-accent',
              n < 0 && '!text-loss',
            )}
          />
          <div className="mt-2 text-[12px] text-muted">{r !== null ? <span className="num">{fmtR(r)}</span> : tx('modal.brokerPnlHint')}</div>
        </>
      ) : (
        <>
          <div key={String(n)} className="mt-2.5 animate-ticker">
            <Pnl value={n} neutralZero={false} className="text-[30px] font-semibold leading-none tracking-tight">
              {fmtMoney(n, currency, { sign: true })}
            </Pnl>
          </div>
          <div className="mt-2 text-[12px] text-muted">{r !== null ? <span className="num text-text-2">{fmtR(r)}</span> : tx('modal.addStopR')}</div>
        </>
      )}

      {metrics.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-3.5">
          {metrics.map((m) => (
            <div key={m.label} className="min-w-0">
              <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{m.label}</div>
              <div className={clsx('num mt-1 truncate text-[13px] font-semibold', m.warn ? 'text-amber' : 'text-text')}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function DirectionPick({ value, onChange }: { value: Direction; onChange: (d: Direction) => void }) {
  const tx = useT()
  const items = [
    { value: 'LONG' as const, label: tx('dir.long'), Icon: ArrowUpRight, tint: 'text-accent' },
    { value: 'SHORT' as const, label: tx('dir.short'), Icon: ArrowDownRight, tint: 'text-loss' },
    { value: 'NONE' as const, label: tx('dir.none'), Icon: Minus, tint: 'text-dim' },
  ]
  const idx = items.findIndex((d) => d.value === value)

  return (
    <div className="relative flex h-11 w-full items-center rounded-xl border border-border bg-surface-2 p-1" role="radiogroup" aria-label={tx('modal.direction')}>
      <span
        className="absolute bottom-1 top-1 rounded-[9px] bg-text shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ left: `calc(${idx} * (100% - 8px) / 3 + 4px)`, width: 'calc((100% - 8px) / 3)' }}
      />
      {items.map((d) => {
        const active = value === d.value
        const Icon = d.Icon
        return (
          <button
            key={d.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(d.value)}
            className={clsx(
              'relative z-[1] inline-flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[9px] text-[12px] font-semibold transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25',
              active ? 'text-black' : 'text-muted hover:text-text',
            )}
          >
            <Icon size={14} strokeWidth={2.25} className={clsx('shrink-0', !active && d.tint)} />
            <span className="truncate">{d.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function PresetRow({ symbol, onPick }: { symbol: string; onPick: (s: string) => void }) {
  const shown = INSTRUMENT_PRESETS.slice(0, 6)
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((p) => {
        const on = symbol.trim().toUpperCase() === p.symbol
        return (
          <button
            key={p.symbol}
            type="button"
            title={p.hint}
            aria-pressed={on}
            onClick={() => onPick(p.symbol)}
            className={clsx(
              'mono h-7 rounded-lg border px-2.5 text-[11px] font-semibold transition-all duration-200 active:scale-[0.96]',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25',
              on ? 'border-text bg-text text-black' : 'border-border bg-surface-2 text-muted hover:border-border-3 hover:text-text',
            )}
          >
            {p.symbol}
          </button>
        )
      })}
    </div>
  )
}

function ResultChip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean
  tone: 'green' | 'red' | 'neutral'
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'h-7 rounded-full border px-2.5 text-[12px] font-semibold transition-all duration-200 active:scale-[0.96]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25',
        active && tone === 'green' && 'border-accent/25 bg-accent/10 text-accent',
        active && tone === 'red' && 'border-loss/25 bg-loss/10 text-loss',
        active && tone === 'neutral' && 'border-border-3 bg-surface-4 text-text',
        !active && 'border-border bg-surface-2/80 text-muted hover:border-border-2 hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function Panel({ label, extra, delay, children }: { label: string; extra?: ReactNode; delay?: number; children: ReactNode }) {
  return (
    <section
      className={clsx('rounded-2xl border border-border bg-surface/70 p-4 @sm:p-5 animate-section-rise', INSET)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <header className="mb-4 flex min-h-5 items-center justify-between gap-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">{label}</h3>
        {extra}
      </header>
      {children}
    </section>
  )
}

function SubBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-dim">{label}</div>
      {children}
    </div>
  )
}

function Fold({
  title,
  hint,
  badge,
  defaultOpen,
  delay,
  children,
}: {
  title: string
  hint?: string
  badge?: string
  defaultOpen?: boolean
  delay?: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <section
      className={clsx('overflow-hidden rounded-2xl border border-border bg-surface/70 transition-colors duration-300 hover:border-border-2 animate-section-rise', INSET)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.015] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/20 @sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tracking-tight">{title}</span>
            {badge && (
              <span className="num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md border border-border bg-surface-3 px-1 text-[10px] font-semibold text-muted">
                {badge}
              </span>
            )}
          </div>
          {hint && <div className="mt-0.5 truncate text-[11px] text-dim">{hint}</div>}
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-dim">
          <ChevronDown size={14} className={clsx('transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]', open && 'rotate-180')} />
        </span>
      </button>
      {open && <div className="border-t border-border px-4 pb-5 pt-4 animate-field-in @sm:px-5">{children}</div>}
    </section>
  )
}

function StatusToggle({ value, onChange, full }: { value: TradeStatus; onChange: (s: TradeStatus) => void; full?: boolean }) {
  const tx = useT()
  const options: TradeStatus[] = ['CLOSED', 'OPEN']
  const idx = options.indexOf(value)

  return (
    <div
      role="radiogroup"
      aria-label={tx('modal.status')}
      className={clsx('relative flex items-center rounded-xl border border-border bg-surface-2', full ? 'h-11 w-full p-1' : 'h-8 w-fit p-[3px]')}
    >
      <span
        className={clsx(
          'absolute rounded-[9px] bg-text shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          full ? 'bottom-1 top-1' : 'bottom-[3px] top-[3px]',
        )}
        style={
          full
            ? { left: `calc(${idx} * (100% - 8px) / 2 + 4px)`, width: 'calc((100% - 8px) / 2)' }
            : { left: `calc(${idx} * (100% - 6px) / 2 + 3px)`, width: 'calc((100% - 6px) / 2)' }
        }
      />
      {options.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={clsx(
            'relative z-[1] inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-[9px] text-[12px] font-semibold transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25',
            full ? '' : 'px-3',
            value === s ? 'text-black' : 'text-muted hover:text-text',
          )}
        >
          {s === 'OPEN' && <span className={clsx('h-1.5 w-1.5 rounded-full bg-sky', value === 'OPEN' && 'animate-pulse')} />}
          {s === 'CLOSED' ? tx('common.closed') : tx('common.open')}
        </button>
      ))}
    </div>
  )
}

function MarketSelect({
  value,
  preferred,
  onChange,
  className,
}: {
  value: Market
  preferred?: Market[]
  onChange: (market: Market) => void
  className?: string
}) {
  const locale = useLocale()
  const tx = useT()
  const preferredSet = new Set((preferred ?? []).filter((m) => MARKETS.includes(m)))
  const ordered = orderedMarketOptions(preferred)
  const yours = ordered.filter((m) => preferredSet.has(m))
  const others = ordered.filter((m) => !preferredSet.has(m))
  const groups = yours.length
    ? [
        { label: tx('market.yours'), options: yours.map((m) => ({ value: m, label: marketLabel(locale, m) })) },
        ...(others.length ? [{ label: tx('market.others'), options: others.map((m) => ({ value: m, label: marketLabel(locale, m) })) }] : []),
      ]
    : undefined
  return (
    <Select
      value={value}
      onChange={(v) => onChange(v as Market)}
      options={groups ? undefined : MARKETS.map((m) => ({ value: m, label: marketLabel(locale, m) }))}
      groups={groups}
      className={className}
    />
  )
}
