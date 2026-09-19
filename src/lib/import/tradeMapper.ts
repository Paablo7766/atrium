import type { Market, Trade } from '@/types'
import { presetForSymbol } from '@/lib/instruments'
import { tradeDurationMs, tradeOutcome } from '@/lib/stats'
import type { BrokerId, ConsolidatedTrade, InstrumentType } from './types'
import { createId } from './parse'

export interface TradeMapperOptions {
  /** Mercado por defecto si no hay preset ni tipo de instrumento. */
  defaultMarket?: Market
  /** Etiqueta de estrategia / origen. */
  strategyLabel?: string
  /** Prefijo de tags (default: broker-import). */
  tagPrefix?: string
  broker?: BrokerId | string
  now?: string
  idFactory?: () => string
  /**
   * Si true (default), un ConsolidatedTrade OPEN con cierres parciales
   * genera 2 trades UI: CLOSED (realizado) + OPEN (remanente) para alimentar gráficos.
   */
  splitPartials?: boolean
}

/** Trade del store + campos derivados listos para UI / Recharts. */
export interface MappedTrade extends Trade {
  isWin: boolean
  isLoss: boolean
  isBreakeven: boolean
  durationMinutes: number | null
  outcome: 'WIN' | 'LOSS' | 'BE' | 'OPEN'
  /** Id del ConsolidatedTrade de origen. */
  sourceTradeId: string
  sourceBroker?: string
}

const INSTRUMENT_TO_MARKET: Record<InstrumentType, Market> = {
  STOCK: 'Acciones',
  CFD: 'Índices',
  FOREX: 'Forex',
  FUTURE: 'Futuros',
  OPTION: 'Opciones',
  CRYPTO: 'Crypto',
  OTHER: 'Otros',
}

const EPS = 1e-8

export function marketFromInstrument(type: InstrumentType, ticker: string, fallback: Market = 'Otros'): Market {
  const preset = presetForSymbol(ticker)
  if (preset) return preset.market
  return INSTRUMENT_TO_MARKET[type] ?? fallback
}

function durationMinutesOf(entryIso: string, exitIso: string | null | undefined): number | null {
  if (!exitIso) return null
  const ms = new Date(exitIso).getTime() - new Date(entryIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.round(ms / 60_000)
}

function enrich(trade: Trade, sourceTradeId: string, sourceBroker?: string): MappedTrade {
  const outcome = tradeOutcome(trade)
  const mins =
    trade.status === 'CLOSED' && trade.exitDate
      ? Math.round(tradeDurationMs(trade) / 60_000)
      : durationMinutesOf(trade.entryDate, trade.exitDate)

  return {
    ...trade,
    isWin: outcome === 'WIN',
    isLoss: outcome === 'LOSS',
    isBreakeven: outcome === 'BE',
    durationMinutes: mins,
    outcome,
    sourceTradeId,
    sourceBroker,
  }
}

function baseTags(broker: string | undefined, tagPrefix: string, extra: string[] = []): string[] {
  const tags = [tagPrefix]
  if (broker) tags.push(`broker:${broker.toLowerCase().replace(/\s+/g, '_')}`)
  return [...tags, ...extra]
}

/**
 * Mapea un ConsolidatedTrade del motor FIFO → Trade(s) del store local.
 */
export function mapConsolidatedTrade(ct: ConsolidatedTrade, options: TradeMapperOptions = {}): MappedTrade[] {
  const now = options.now ?? new Date().toISOString()
  const idFactory = options.idFactory ?? createId
  const broker = options.broker
  const tagPrefix = options.tagPrefix ?? 'broker-import'
  const strategy =
    options.strategyLabel ?? (broker ? `Import · ${broker}` : 'Import · broker')
  const defaultMarket = options.defaultMarket ?? 'Otros'
  const splitPartials = options.splitPartials !== false

  const market = marketFromInstrument(ct.instrumentType, ct.ticker, defaultMarket)
  const preset = presetForSymbol(ct.ticker)
  const multiplier =
    ct.multiplier > 0 && Number.isFinite(ct.multiplier)
      ? ct.multiplier
      : preset?.multiplier && preset.multiplier > 0
        ? preset.multiplier
        : 1

  const direction = ct.direction === 'SHORT' ? 'SHORT' : 'LONG'
  const tags = baseTags(broker, tagPrefix)
  const out: MappedTrade[] = []

  const hasClosed = ct.quantityClosed > EPS && ct.avgExitPrice != null
  const hasOpen = ct.status === 'OPEN' && ct.quantity > EPS

  // --- Pierna cerrada (round-trip completo o parcial) ---
  if (hasClosed && (ct.status === 'CLOSED' || splitPartials)) {
    const qty = ct.quantityClosed
    const entryPrice = Number.isFinite(ct.avgEntryPrice) ? ct.avgEntryPrice : 0
    const exitPrice = ct.avgExitPrice!
    const fees = Number.isFinite(ct.feesTotal) ? Math.abs(ct.feesTotal) : 0
    const netPnl = ct.netPnl

    const trade: Trade = {
      id: ct.status === 'CLOSED' || !hasOpen ? ct.id || idFactory() : `${ct.id || idFactory()}-closed`,
      symbol: ct.ticker.toUpperCase(),
      market,
      direction,
      status: 'CLOSED',
      entryDate: ct.openedAt,
      exitDate: ct.closedAt ?? ct.openedAt,
      entryPrice,
      exitPrice,
      quantity: qty,
      multiplier,
      fees,
      strategy,
      tags: hasOpen ? [...tags, 'partial-close'] : tags,
      notes: `source:${ct.id}`,
      rating: 0,
      createdAt: now,
      updatedAt: now,
      ...(netPnl !== null && Number.isFinite(netPnl) ? { pnlOverride: netPnl } : {}),
    }
    out.push(enrich(trade, ct.id, broker))
  }

  // --- Remanente abierto ---
  if (hasOpen) {
    const entryPrice = Number.isFinite(ct.avgEntryPrice) ? ct.avgEntryPrice : 0
    // Si ya emitimos la pierna cerrada, las fees del remanente se dejan en 0 (ya contadas).
    const feesOnOpen = hasClosed && splitPartials ? 0 : Number.isFinite(ct.feesTotal) ? Math.abs(ct.feesTotal) : 0

    const trade: Trade = {
      id: hasClosed && splitPartials ? `${ct.id || idFactory()}-open` : ct.id || idFactory(),
      symbol: ct.ticker.toUpperCase(),
      market,
      direction,
      status: 'OPEN',
      entryDate: ct.openedAt,
      entryPrice,
      quantity: ct.quantity,
      multiplier,
      fees: feesOnOpen,
      strategy,
      tags: hasClosed ? [...tags, 'open-remainder'] : tags,
      notes: `source:${ct.id}`,
      rating: 0,
      createdAt: now,
      updatedAt: now,
    }
    out.push(enrich(trade, ct.id, broker))
  }

  // Edge: CLOSED sin quantityClosed (datos corruptos) → no emitir basura
  if (!out.length && ct.status === 'CLOSED' && ct.avgExitPrice != null) {
    const trade: Trade = {
      id: ct.id || idFactory(),
      symbol: ct.ticker.toUpperCase(),
      market,
      direction,
      status: 'CLOSED',
      entryDate: ct.openedAt,
      exitDate: ct.closedAt ?? ct.openedAt,
      entryPrice: ct.avgEntryPrice || 0,
      exitPrice: ct.avgExitPrice,
      quantity: Math.max(ct.quantity, ct.quantityClosed, 0) || 1,
      multiplier,
      fees: Math.abs(ct.feesTotal || 0),
      strategy,
      tags,
      notes: `source:${ct.id}`,
      rating: 0,
      createdAt: now,
      updatedAt: now,
      ...(ct.netPnl != null && Number.isFinite(ct.netPnl) ? { pnlOverride: ct.netPnl } : {}),
    }
    out.push(enrich(trade, ct.id, broker))
  }

  return out
}

/** Array completo ConsolidatedTrade[] → MappedTrade[] (store-ready + derivados UI). */
export function mapConsolidatedTrades(
  trades: ConsolidatedTrade[],
  options: TradeMapperOptions = {},
): MappedTrade[] {
  return trades.flatMap((ct) => mapConsolidatedTrade(ct, options))
}

/** Quita campos derivados para persistir / importData (solo shape `Trade`). */
export function toStoreTrade(mapped: MappedTrade): Trade {
  const {
    isWin: _w,
    isLoss: _l,
    isBreakeven: _b,
    durationMinutes: _d,
    outcome: _o,
    sourceTradeId: _s,
    sourceBroker: _sb,
    ...trade
  } = mapped
  return trade
}

export function toStoreTrades(mapped: MappedTrade[]): Trade[] {
  return mapped.map(toStoreTrade)
}
