import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, Minus, Share2, Trash2 } from 'lucide-react'
import { useStore } from '@/store'
import { DEFAULT_MISTAKES, EMOTIONS, MARKETS, orderedMarketOptions, type Direction, type Emotion, type Market, type PlaybookSetup, type Trade, type TradeFormMode, type TradeStatus } from '@/types'
import { Button, Field, Input, Modal, Segmented, Select, Stars, Textarea, Confirm } from './ui'
import { fmtMoney, fmtR, fromLocalInputValue, toLocalInputValue, todayKey } from '@/lib/format'
import { useT, useLocale } from '@/lib/useI18n'
import { directionLabel, emotionLabel, marketLabel, mistakeLabel } from '@/lib/i18n'
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
  const livePnl = mode === 'simple' || f.usePnlOverride ? num(f.pnlOverride) : isClosed ? preview.pnl : undefined
  const liveLine = f.symbol
    ? [f.symbol, marketLabel(locale, f.market), f.direction === 'NONE' ? null : directionLabel(locale, f.direction), isClosed && livePnl !== undefined ? fmtMoney(livePnl, settings.currency, { sign: true }) : null]
        .filter(Boolean)
        .join(' · ')
    : ''

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
          <span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.22em] text-dim mb-1.5">{tx('modal.kicker')}</span>
            {trade ? tx('modal.edit') : tx('modal.new')}
          </span>
        }
        subtitle={liveLine || tx(MODE_META[mode].subtitleKey)}
        width={MODE_META[mode].width}
        className="!rounded-[22px] !max-h-[min(88vh,760px)]"
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
          <div className="flex items-center justify-between w-full gap-3">
            <div className="min-w-0 flex items-center gap-3">
              {trade && (
                <Button variant="ghost" className="text-loss hover:bg-loss/10" onClick={() => setConfirmDel(true)}>
                  <Trash2 size={15} /> {tx('common.delete')}
                </Button>
              )}
              {trade && trade.status === 'CLOSED' && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    openShareCard({ kind: 'trade', tradeId: trade.id })
                  }}
                >
                  <Share2 size={15} /> {tx('modal.card')}
                </Button>
              )}
              {error ? (
                <p className="text-[12px] text-loss leading-snug animate-field-in">{error}</p>
              ) : (
                <p className="text-[11px] text-dim hidden sm:block">{tx('modal.ctrlEnter')}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" onClick={requestClose}>
                {tx('common.cancel')}
              </Button>
              <Button variant="primary" size="lg" onClick={submit} className="shadow-glow min-w-[148px] transition-transform duration-200 active:scale-[0.98]">
                {trade ? tx('modal.save') : tx('modal.register')}
              </Button>
            </div>
          </div>
        }
      >
        <div key={mode} className="animate-section-rise">
          {lossLimitHit && (
            <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-loss/30 bg-loss/10 px-4 py-3 text-[13px] leading-relaxed animate-field-in">
              <span className="text-loss font-semibold shrink-0">{tx('modal.dailyLimit')}</span>
              <span className="text-text-2">
                {tx('modal.dailyLimitBody', {
                  pnl: fmtMoney(todayAgg!.pnl, settings.currency, { sign: true }),
                  limit: fmtMoney(-settings.dailyLossLimit, settings.currency),
                })}
              </span>
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
    <div className="flex flex-col gap-6 min-w-0">
      <FormSection title={tx('modal.theTrade')} delay={30}>
        <div className="grid grid-cols-[1fr_auto] gap-2.5 items-end">
          <Field label={tx('modal.what')}>
            <Input
              list="symbols-simple"
              value={f.symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder={tx('modal.whatPh')}
              mono
              autoFocus
              className="h-12 text-[20px] font-semibold tracking-tight rounded-[16px] px-4 transition-shadow duration-300 focus:shadow-[0_0_0_4px_rgba(74,222,128,0.1)]"
            />
            <datalist id="symbols-simple">
              {symbols.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label={tx('modal.market')} className="w-[132px] shrink-0">
            <MarketSelect value={f.market} preferred={preferredMarkets} onChange={(m) => set('market', m)} />
          </Field>
        </div>
        <PresetRow symbol={f.symbol} onPick={setSymbol} compact />
        <div className="mt-4">
          <p className="text-[11px] font-medium text-muted tracking-wide mb-2">{tx('modal.direction')}</p>
          <DirectionPick value={f.direction} onChange={(d) => set('direction', d)} size="sm" />
        </div>
      </FormSection>

      <FormSection title={tx('modal.sideWhen')} delay={60}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('modal.when')}>
            <Input type="date" value={dateValue} onChange={(e) => setDate(e.target.value)} className="rounded-[14px] h-11" />
          </Field>
          <Field label={tx('modal.status')}>
            <StatusToggle value={f.status} onChange={(s) => set('status', s)} simple />
          </Field>
        </div>
      </FormSection>

      {isClosed && (
        <FormSection title={tx('modal.result')} delay={80}>
          <PnlPad pnl={pnl} currency={currency} r={previewR} value={f.pnlOverride} onChange={(v) => set('pnlOverride', v)} compact />
        </FormSection>
      )}

      <Fold title={tx('modal.context')} hint={tx('modal.contextHint')} badge={extra ? String(extra) : undefined} defaultOpen={extra > 0}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('modal.entryPrice')} hint={tx('modal.entryPriceHintOpt')}>
            <Input mono inputMode="decimal" value={f.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} placeholder="—" className="rounded-[14px]" />
          </Field>
          <Field label={tx('modal.stop')}>
            <Input
              mono
              inputMode="decimal"
              value={f.stopLoss}
              onChange={(e) => set('stopLoss', e.target.value)}
              placeholder="—"
              disabled={!num(f.entryPrice)}
              className="rounded-[14px]"
            />
          </Field>
          <Field label={tx('trades.strategy')} hint={tx('modal.strategyHint')}>
            <Input value={f.strategy} onChange={(e) => set('strategy', e.target.value)} placeholder={tx('modal.strategyPh')} className="rounded-[14px]" />
          </Field>
          <Field label={tx('modal.emotion')}>
            <Select
              value={f.emotion}
              onChange={(v) => set('emotion', v as Emotion | '')}
              placeholder={tx('emotion.none')}
              options={[{ value: '', label: tx('emotion.none') }, ...EMOTIONS.map((e) => ({ value: e, label: emotionLabel(locale, e) }))]}
            />
          </Field>
        </div>
        {f.stopLoss && !num(f.entryPrice) && <p className="text-[11px] text-dim mt-2">{tx('modal.stopNeedEntry')}</p>}
        <div className="mt-4">
          <ProcessFields f={f} set={set} playbook={playbook} mistakes={mistakes} />
        </div>
        <Field label={tx('modal.note')} className="mt-4">
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder={tx('modal.notePh')} className="min-h-[72px] rounded-[14px]" />
        </Field>
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

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <FormSection title={tx('modal.instrument')} delay={30}>
        <div className="grid grid-cols-[1fr_auto] gap-2.5 items-end">
          <Field label={tx('modal.symbol')}>
            <Input
              list="symbols-premium"
              value={f.symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder={tx('modal.symbolPh2')}
              mono
              autoFocus
              className="h-11 text-[17px] font-semibold tracking-tight rounded-[14px] transition-shadow duration-300 focus:shadow-[0_0_0_4px_rgba(74,222,128,0.1)]"
            />
            <datalist id="symbols-premium">
              {symbols.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label={tx('modal.market')} className="w-[132px] shrink-0">
            <MarketSelect value={f.market} preferred={preferredMarkets} onChange={(m) => set('market', m)} />
          </Field>
        </div>
        <PresetRow symbol={f.symbol} onPick={setSymbol} compact />
        <div className="mt-4">
          <p className="text-[11px] font-medium text-muted tracking-wide mb-2">{tx('modal.direction')}</p>
          <DirectionPick value={f.direction} onChange={(d) => set('direction', d)} size="sm" />
        </div>
      </FormSection>

      <FormSection title={tx('modal.execution')} hint={tx('modal.executionHint')} delay={50}>
        <div className="mb-3">
          <StatusToggle value={f.status} onChange={(s) => set('status', s)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('modal.entry')}>
            <Input type="datetime-local" value={f.entryDate} onChange={(e) => set('entryDate', e.target.value)} className="rounded-[14px]" />
          </Field>
          <Field label={tx('modal.exit')}>
            <Input type="datetime-local" value={f.exitDate} onChange={(e) => set('exitDate', e.target.value)} disabled={!isClosed} className="rounded-[14px]" />
          </Field>
          <Field label={tx('modal.entryPrice')}>
            <Input mono inputMode="decimal" value={f.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} placeholder="0.00" className="rounded-[14px]" />
          </Field>
          <Field label={tx('modal.exitPrice')}>
            <Input
              mono
              inputMode="decimal"
              value={f.exitPrice}
              onChange={(e) => set('exitPrice', e.target.value)}
              placeholder="0.00"
              disabled={!isClosed || f.usePnlOverride}
              className="rounded-[14px]"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title={tx('modal.result')} delay={70}>
        <ResultStrip
          isClosed={isClosed}
          pnl={shownPnl}
          r={preview.r}
          currency={currency}
          useOverride={f.usePnlOverride}
          override={f.pnlOverride}
          onToggle={() => set('usePnlOverride', !f.usePnlOverride)}
          onOverride={(v) => set('pnlOverride', v)}
        />
        {(preview.risk || preview.plannedR || riskPct !== null) && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted">
            {preview.risk ? (
              <span>
                {tx('modal.risk1r')} <span className="num text-text font-semibold">{fmtMoney(preview.risk, currency)}</span>
              </span>
            ) : null}
            {riskPct !== null ? (
              <span className={riskWarn ? 'text-amber' : undefined}>
                {tx('modal.acctPct')} <span className="num font-semibold">{riskPct.toFixed(2)}%</span>
              </span>
            ) : null}
            {preview.plannedR ? (
              <span>
                {tx('modal.plannedR')} <span className="num text-text font-semibold">{preview.plannedR.toFixed(2)}R</span>
              </span>
            ) : null}
          </div>
        )}
      </FormSection>

      <div className="flex flex-col gap-3">
        <Fold title={tx('modal.sizeRisk')} hint={tx('modal.sizeRiskHint')} badge={sizeExtra ? String(sizeExtra) : undefined} defaultOpen={sizeExtra > 0}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tx('modal.qty')}>
              <Input mono inputMode="decimal" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} className="rounded-[14px]" />
            </Field>
            <Field label={tx('modal.multiplier')} hint={tx('modal.multiplierHint')}>
              <Input mono inputMode="decimal" value={f.multiplier} onChange={(e) => set('multiplier', e.target.value)} className="rounded-[14px]" />
            </Field>
            <Field label={tx('modal.fees')}>
              <Input mono inputMode="decimal" value={f.fees} onChange={(e) => set('fees', e.target.value)} className="rounded-[14px]" />
            </Field>
            <Field label={tx('modal.stop')} hint={tx('modal.stopHint')}>
              <Input mono inputMode="decimal" value={f.stopLoss} onChange={(e) => set('stopLoss', e.target.value)} placeholder="0.00" className="rounded-[14px]" />
            </Field>
            <Field label={tx('modal.tp')}>
              <Input mono inputMode="decimal" value={f.takeProfit} onChange={(e) => set('takeProfit', e.target.value)} placeholder="0.00" className="rounded-[14px]" />
            </Field>
            <div className="flex items-end">
              {size ? (
                <button
                  type="button"
                  onClick={() => set('quantity', String(size.qty))}
                  className="w-full h-11 px-3.5 rounded-[14px] border border-border-2 bg-surface-3/60 text-[12px] text-left hover:border-accent/40 hover:bg-accent/5 active:scale-[0.99] transition-all duration-200"
                >
                  <span className="block text-dim">{tx('modal.sizeLine', { pct: riskPerTrade, money: fmtMoney(size.riskMoney, currency) })}</span>
                  <span className="text-accent font-semibold">{tx('modal.useSize', { qty: size.qty })}</span>
                </button>
              ) : (
                <div className="w-full h-11 px-3.5 rounded-[14px] border border-dashed border-border bg-transparent flex items-center text-[12px] text-dim">
                  {tx('modal.stopForR')}
                </div>
              )}
            </div>
          </div>
        </Fold>

        <Fold title={tx('modal.context')} hint={tx('modal.contextHint2')} badge={contextExtra ? String(contextExtra) : undefined} defaultOpen={contextExtra > 0}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tx('trades.strategy')}>
              <Input list="strategies-premium" value={f.strategy} onChange={(e) => set('strategy', e.target.value)} placeholder={tx('modal.strategyPh2')} className="rounded-[14px]" />
              <datalist id="strategies-premium">
                {strategies.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label={tx('modal.tags')}>
              <Input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder={tx('modal.tagsPh')} className="rounded-[14px]" />
            </Field>
            <Field label={tx('modal.emotion')}>
              <Select
                value={f.emotion}
                onChange={(v) => set('emotion', v as Emotion | '')}
                placeholder={tx('emotion.none')}
                options={[{ value: '', label: tx('emotion.none') }, ...EMOTIONS.map((e) => ({ value: e, label: emotionLabel(locale, e) }))]}
              />
            </Field>
            <Field label={tx('modal.rating')}>
              <div className="h-11 flex items-center px-1">
                <Stars value={f.rating} onChange={(v) => set('rating', v)} size={22} />
              </div>
            </Field>
          </div>
          <Field label={tx('modal.note')} className="mt-3">
            <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder={tx('modal.notePh2')} className="rounded-[14px] min-h-[72px]" />
          </Field>
        </Fold>

        <Fold title={tx('modal.process')} hint={tx('modal.processHint')} badge={processExtra ? String(processExtra) : undefined} defaultOpen={processExtra > 0}>
          <ProcessFields f={f} set={set} playbook={playbook} mistakes={mistakes} />
        </Fold>
      </div>
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

  return (
    <div className="flex flex-col gap-4">
      <Field label={tx('modal.setup')} hint={playbook.length ? tx('modal.setupHint') : tx('modal.setupHintEmpty')}>
        <Select
          value={f.setupId}
          onChange={pickSetup}
          placeholder={tx('common.noSetup')}
          options={[{ value: '', label: tx('common.noSetup') }, ...playbook.map((s) => ({ value: s.id, label: s.name }))]}
        />
      </Field>
      {setup?.checklist.length ? (
        <div>
          <div className="text-[11px] font-medium text-muted mb-2">{tx('modal.checklist', { name: setup.name })}</div>
          <div className="flex flex-col gap-1.5">
            {setup.checklist.map((item) => {
              const on = f.checklistDone.includes(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleCheck(item.id)}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left text-[13px] border transition-all duration-200',
                    on ? 'bg-accent/10 border-accent/25 text-text' : 'bg-surface-3/60 border-border text-muted hover:text-text',
                  )}
                >
                  <span
                    className={clsx(
                      'w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-colors',
                      on ? 'bg-accent border-accent text-black' : 'border-border-3',
                    )}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  {item.label}
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
                onClick={() => toggleMistake(m)}
                className={clsx(
                  'h-8 px-3 rounded-full text-[12px] font-semibold border transition-all duration-200',
                  on ? 'bg-loss/15 text-loss border-loss/30' : 'bg-surface-3 text-muted border-border hover:text-text',
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

function PnlPad({
  pnl,
  currency,
  r,
  value,
  onChange,
  compact,
}: {
  pnl: number | undefined
  currency: 'USD' | 'EUR' | 'GBP'
  r: number | null
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  const tx = useT()
  return (
    <div
      className={clsx(
        'relative overflow-hidden border transition-all duration-300',
        compact ? 'rounded-[18px] p-4' : 'rounded-[22px] p-5',
        pnl !== undefined && pnl > 0
          ? 'bg-accent/[0.07] border-accent/25 shadow-[inset_0_1px_0_rgba(74,222,128,0.08)]'
          : pnl !== undefined && pnl < 0
            ? 'bg-loss/[0.07] border-loss/25 shadow-[inset_0_1px_0_rgba(248,113,113,0.08)]'
            : 'bg-surface-3/50 border-border-2',
      )}
    >
      {pnl !== undefined && pnl !== 0 && (
        <div
          className="absolute -right-10 -top-12 w-36 h-36 rounded-full blur-3xl animate-glow-breathe pointer-events-none"
          style={{ background: pnl > 0 ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.16)' }}
        />
      )}
      <div className={clsx('relative flex items-center justify-between gap-3', compact ? 'mb-2.5' : 'mb-3.5')}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-dim">{tx('modal.brokerNet')}</span>
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
      </div>
      <Input
        mono
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tx('modal.pnlPh')}
        className={clsx(
          'relative font-semibold tracking-tight rounded-[16px] bg-surface/40 border-border/60 transition-shadow duration-300 focus:shadow-[0_0_0_4px_rgba(255,255,255,0.04)]',
          compact ? 'h-14 text-[26px]' : 'h-[68px] text-[32px]',
          pnl !== undefined && pnl > 0 && 'text-accent',
          pnl !== undefined && pnl < 0 && 'text-loss',
        )}
      />
      <p className={clsx('relative text-[11px] text-dim', compact ? 'mt-2' : 'mt-3')}>{tx('modal.withFees')}</p>
      {pnl !== undefined && (
        <div key={String(pnl)} className={clsx('relative num text-[14px] font-semibold mt-1 animate-ticker', pnl > 0 ? 'text-accent' : pnl < 0 ? 'text-loss' : 'text-muted')}>
          {fmtMoney(pnl, currency, { sign: true })}
          {r !== null && <span className="text-muted font-medium"> · {fmtR(r)}</span>}
        </div>
      )}
    </div>
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
}: {
  isClosed: boolean
  pnl: number | undefined
  r: number | null
  currency: 'USD' | 'EUR' | 'GBP'
  useOverride: boolean
  override: string
  onToggle: () => void
  onOverride: (v: string) => void
}) {
  const tx = useT()
  if (!isClosed) {
    return (
      <div className="rounded-[22px] border border-border-2 bg-surface-3/50 px-5 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">{tx('modal.open')}</div>
        <div className="text-[22px] font-semibold tracking-tight mt-1">—</div>
        <p className="text-[12px] text-muted mt-1">{tx('modal.openHint')}</p>
      </div>
    )
  }
  const n = pnl ?? 0
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-[22px] border p-5 transition-colors duration-300',
        n > 0 ? 'bg-accent/[0.08] border-accent/25' : n < 0 ? 'bg-loss/[0.08] border-loss/25' : 'bg-surface-3/60 border-border-2',
      )}
    >
      {n !== 0 && (
        <div
          className="absolute -right-8 -top-10 w-32 h-32 rounded-full blur-3xl animate-glow-breathe pointer-events-none"
          style={{ background: n > 0 ? 'rgba(74,222,128,0.22)' : 'rgba(248,113,113,0.18)' }}
        />
      )}
      <div className="flex items-start justify-between gap-3 relative">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">{useOverride ? tx('modal.manualPnl') : tx('modal.netPnl')}</div>
          {useOverride ? (
            <Input
              mono
              inputMode="decimal"
              value={override}
              onChange={(e) => onOverride(e.target.value)}
              placeholder="0.00"
              className={clsx(
                'h-14 text-[28px] font-semibold tracking-tight rounded-2xl bg-transparent border-0 px-0 mt-1',
                n > 0 && 'text-accent',
                n < 0 && 'text-loss',
              )}
            />
          ) : (
            <div key={String(n)} className={clsx('num text-[34px] font-semibold tracking-tight mt-1 animate-ticker', n > 0 ? 'text-accent' : n < 0 ? 'text-loss' : 'text-text')}>
              {fmtMoney(n, currency, { sign: true })}
            </div>
          )}
          <div className="text-[12px] text-muted mt-1">{r !== null ? fmtR(r) : tx('modal.addStopR')}</div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={clsx(
            'h-8 px-3 rounded-full text-[12px] font-semibold border shrink-0 transition-colors',
            useOverride ? 'bg-text text-black border-text' : 'bg-surface-2 text-muted border-border-2 hover:text-text',
          )}
        >
          {useOverride ? tx('modal.calculated') : tx('modal.manual')}
        </button>
      </div>
    </div>
  )
}

function DirectionPick({ value, onChange, size = 'md' }: { value: Direction; onChange: (d: Direction) => void; size?: 'sm' | 'md' | 'lg' }) {
  const tx = useT()
  const items = [
    {
      value: 'LONG' as const,
      title: tx('dir.bought'),
      short: tx('dir.long'),
      sub: tx('dir.long'),
      Icon: ArrowUpRight,
      tone: 'long' as const,
    },
    {
      value: 'SHORT' as const,
      title: tx('dir.sold'),
      short: tx('dir.short'),
      sub: tx('dir.short'),
      Icon: ArrowDownRight,
      tone: 'short' as const,
    },
    {
      value: 'NONE' as const,
      title: tx('dir.noneCard'),
      short: '—',
      sub: tx('dir.none'),
      Icon: Minus,
      tone: 'none' as const,
    },
  ]

  if (size === 'sm') {
    return (
      <div
        className="relative flex items-center p-1 rounded-2xl bg-surface-3/80 border border-border h-11 w-full"
        role="radiogroup"
        aria-label={tx('modal.direction')}
      >
        <span
          className="absolute top-1 bottom-1 rounded-[14px] bg-text shadow-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            left: `calc(${items.findIndex((d) => d.value === value)} * (100% - 8px) / 3 + 4px)`,
            width: 'calc((100% - 8px) / 3)',
          }}
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
                'relative z-[1] flex-1 h-full rounded-[14px] text-[12px] font-semibold transition-colors duration-200 inline-flex items-center justify-center gap-1.5',
                active ? 'text-black' : 'text-muted hover:text-text',
              )}
            >
              <Icon size={13} strokeWidth={2.25} />
              {d.short}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label={tx('modal.direction')}>
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
              'group relative overflow-hidden rounded-[16px] border text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              'active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/25',
              size === 'lg' ? 'min-h-[68px] px-3 py-2.5' : 'min-h-[58px] px-2.5 py-2',
              active && 'animate-pick-settle',
              active && d.tone === 'long' && 'bg-accent/[0.11] border-accent/40 text-accent shadow-[0_0_28px_-14px_rgba(74,222,128,0.7),inset_0_1px_0_rgba(74,222,128,0.12)]',
              active && d.tone === 'short' && 'bg-loss/[0.11] border-loss/40 text-loss shadow-[0_0_28px_-14px_rgba(248,113,113,0.55),inset_0_1px_0_rgba(248,113,113,0.1)]',
              active && d.tone === 'none' && 'bg-surface-4/90 border-border-3 text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
              !active && 'bg-[#121214] border-border/80 text-muted hover:text-text hover:border-border-3 hover:bg-surface-3/70',
            )}
          >
            {active && d.tone !== 'none' && (
              <span
                className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full blur-2xl opacity-70"
                style={{ background: d.tone === 'long' ? 'rgba(74,222,128,0.28)' : 'rgba(248,113,113,0.24)' }}
              />
            )}
            <span className="relative flex flex-col h-full">
              <span className="flex items-center justify-between gap-2">
                <span
                  className={clsx(
                    'inline-flex items-center justify-center rounded-[11px] transition-all duration-300',
                    size === 'lg' ? 'h-8 w-8' : 'h-7 w-7',
                    active && d.tone === 'long' && 'bg-accent/20 text-accent',
                    active && d.tone === 'short' && 'bg-loss/20 text-loss',
                    active && d.tone === 'none' && 'bg-surface-3 text-text',
                    !active && 'bg-surface-3/80 text-dim group-hover:text-muted',
                  )}
                >
                  <Icon size={size === 'lg' ? 15 : 14} strokeWidth={2.25} />
                </span>
                {active && (
                  <span key={d.value} className="animate-soft-pop inline-flex h-5 w-5 items-center justify-center rounded-full bg-current/15">
                    <Check size={11} strokeWidth={3} className="opacity-90" />
                  </span>
                )}
              </span>
              <span className={clsx('block font-semibold leading-none tracking-tight mt-auto pt-2.5', size === 'lg' ? 'text-[15px]' : 'text-[14px]')}>
                {d.title}
              </span>
              <span
                className={clsx(
                  'block text-[11px] mt-1 leading-none transition-colors',
                  active && d.tone === 'long' && 'text-accent/75',
                  active && d.tone === 'short' && 'text-loss/75',
                  active && d.tone === 'none' && 'text-muted',
                  !active && 'text-dim',
                )}
              >
                {d.sub}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function PresetRow({ symbol, onPick, compact }: { symbol: string; onPick: (s: string) => void; compact?: boolean }) {
  const shown = INSTRUMENT_PRESETS.slice(0, compact ? 6 : 8)
  return (
    <div className={clsx('flex flex-wrap gap-1.5', compact ? 'mt-2' : 'mt-3')}>
      {shown.map((p) => {
        const on = symbol.trim().toUpperCase() === p.symbol
        return (
          <button
            key={p.symbol}
            type="button"
            title={p.hint}
            onClick={() => onPick(p.symbol)}
            className={clsx(
              'h-8 px-2.5 rounded-xl text-[11px] font-semibold mono transition-all duration-200 active:scale-[0.96]',
              on ? 'bg-text text-black shadow-sm' : 'bg-surface-3/80 text-muted hover:text-text hover:bg-surface-4',
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
      onClick={onClick}
      className={clsx(
        'h-8 px-3 rounded-full text-[12px] font-semibold border transition-all duration-200 active:scale-[0.96]',
        active && tone === 'green' && 'bg-accent/15 text-accent border-accent/30',
        active && tone === 'red' && 'bg-loss/15 text-loss border-loss/30',
        active && tone === 'neutral' && 'bg-surface-4 text-text border-border-3',
        !active && 'bg-surface-2/80 text-muted border-border-2 hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function FormSection({ n, title, hint, delay, children }: { n?: string; title: string; hint?: string; delay?: number; children: ReactNode }) {
  return (
    <section className="animate-section-rise" style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      <div className="flex items-center gap-3 mb-3">
        {n && (
          <span className="num text-[11px] font-medium text-dim/80 tracking-[0.14em] tabular-nums">{n}</span>
        )}
        <h3 className="text-[13px] font-semibold tracking-tight text-text">{title}</h3>
        <span className="flex-1 h-px bg-gradient-to-r from-border-2 via-border to-transparent" />
      </div>
      {hint && <p className="text-[12px] text-dim -mt-1.5 mb-3 leading-relaxed max-w-[52ch]">{hint}</p>}
      {children}
    </section>
  )
}

function Fold({
  title,
  hint,
  badge,
  defaultOpen,
  children,
}: {
  title: string
  hint?: string
  badge?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <section className="rounded-[20px] border border-border-2/90 bg-surface-3/25 overflow-hidden transition-colors duration-300 hover:border-border-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-3/35 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold tracking-tight">{title}</div>
          {hint && <div className="text-[11px] text-dim mt-0.5 truncate">{hint}</div>}
        </div>
        {badge && (
          <span className="text-[11px] font-semibold tabular-nums text-muted bg-surface-3 border border-border px-2 h-6 rounded-full flex items-center">
            {badge}
          </span>
        )}
        <ChevronDown size={16} className={clsx('text-dim shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-border/70 animate-field-in">{children}</div>}
    </section>
  )
}

function StatusToggle({ value, onChange, simple }: { value: TradeStatus; onChange: (s: TradeStatus) => void; simple?: boolean }) {
  const tx = useT()
  const options: TradeStatus[] = ['CLOSED', 'OPEN']
  const idx = options.indexOf(value)

  return (
    <div
      className={clsx(
        'relative flex items-center p-1 rounded-2xl bg-surface-3/80 border border-border',
        simple ? 'h-11 w-full' : 'w-fit h-10',
      )}
    >
      <span
        className="absolute top-1 bottom-1 rounded-[14px] bg-text shadow-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          left: `calc(${idx} * (100% - 8px) / 2 + 4px)`,
          width: 'calc((100% - 8px) / 2)',
        }}
      />
      {options.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={clsx(
            'relative z-[1] rounded-[14px] text-[12px] font-semibold transition-colors duration-200',
            simple ? 'flex-1 h-full' : 'h-full px-4',
            value === s ? 'text-black' : 'text-muted hover:text-text',
          )}
        >
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
}: {
  value: Market
  preferred?: Market[]
  onChange: (market: Market) => void
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
    />
  )
}
