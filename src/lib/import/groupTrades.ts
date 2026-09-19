import type { ConsolidatedTrade, GroupTradesOptions, NormalizedExecution, TradeDirection } from './types'
import { createId, safeDiv } from './parse'

interface Lot {
  qty: number
  price: number
  openedAt: string
  executionKey: string
}

interface OpenTradeBuilder {
  id: string
  ticker: string
  direction: TradeDirection
  instrumentType: NormalizedExecution['instrumentType']
  baseCurrency: string
  quoteCurrency: string
  multiplier: number
  lots: Lot[]
  quantityClosed: number
  /** Σ (qty_cerrada × precio_salida) */
  exitNotional: number
  /** Σ (qty_cerrada × precio_entrada_FIFO) — avg entry fiable tras flat */
  entryNotionalClosed: number
  feesTotal: number
  realizedPnlGross: number
  /** Suma de P&L neto reportado por el bróker (si viene en fills de cierre). */
  reportedNetPnl: number | null
  openedAt: string
  closedAt: string | null
  executionKeys: string[]
}

function executionKey(e: NormalizedExecution, index: number): string {
  return e.externalId?.trim() || `${e.ticker}|${e.executedAt}|${e.side}|${e.quantity}|${e.price}|${index}`
}

function signedSide(side: NormalizedExecution['side']): 1 | -1 {
  return side === 'BUY' ? 1 : -1
}

function positionSign(direction: TradeDirection): 1 | -1 {
  return direction === 'LONG' ? 1 : -1
}

function openQty(lots: Lot[]): number {
  return lots.reduce((s, l) => s + l.qty, 0)
}

function avgEntryFromLots(lots: Lot[]): number {
  const qty = openQty(lots)
  if (qty <= 0) return 0
  const notional = lots.reduce((s, l) => s + l.qty * l.price, 0)
  return safeDiv(notional, qty) ?? 0
}

function freezeTrade(b: OpenTradeBuilder, status: 'OPEN' | 'CLOSED', eps: number): ConsolidatedTrade {
  const qtyOpen = openQty(b.lots)
  const avgEntryOpen = avgEntryFromLots(b.lots)
  const avgEntryClosed =
    b.quantityClosed > eps ? (safeDiv(b.entryNotionalClosed, b.quantityClosed) ?? 0) : 0

  const avgEntryPrice =
    status === 'CLOSED'
      ? avgEntryClosed
      : qtyOpen > eps
        ? avgEntryOpen
        : avgEntryClosed

  const avgExit =
    b.quantityClosed > eps ? (safeDiv(b.exitNotional, b.quantityClosed) ?? null) : null

  const netPnl =
    b.reportedNetPnl !== null && Number.isFinite(b.reportedNetPnl)
      ? b.reportedNetPnl
      : b.quantityClosed > eps || status === 'CLOSED'
        ? b.realizedPnlGross - b.feesTotal
        : null

  return {
    id: b.id,
    ticker: b.ticker,
    instrumentType: b.instrumentType,
    direction: b.direction,
    status,
    quantity: status === 'CLOSED' ? 0 : qtyOpen,
    quantityClosed: b.quantityClosed,
    avgEntryPrice,
    avgExitPrice: avgExit,
    feesTotal: b.feesTotal,
    netPnl,
    baseCurrency: b.baseCurrency,
    quoteCurrency: b.quoteCurrency,
    multiplier: b.multiplier > 0 ? b.multiplier : 1,
    openedAt: b.openedAt,
    closedAt: status === 'CLOSED' ? b.closedAt ?? b.openedAt : null,
    executionKeys: [...b.executionKeys],
  }
}

/**
 * Agrupa executions de un mismo ticker en trades (round-trips) con matching FIFO.
 *
 * - BUY con posición flat o long → abre / añade lotes long.
 * - SELL con long abierto → cierra FIFO (parcial o total); remanente abre short.
 * - Simétrico para shorts.
 * - P&L realizado en cada match; comisiones se acumulan en el trade.
 *
 * Precondición: todas las executions comparten el mismo `ticker` (se filtra por seguridad).
 */
export function groupExecutionsIntoTrades(
  executions: NormalizedExecution[],
  options: GroupTradesOptions = {},
): ConsolidatedTrade[] {
  const idFactory = options.idFactory ?? createId
  const eps = options.flatEpsilon ?? 1e-8

  const sorted = [...executions]
    .filter(
      (e) =>
        e &&
        e.ticker &&
        Number.isFinite(e.quantity) &&
        e.quantity > 0 &&
        Number.isFinite(e.price) &&
        e.price >= 0,
    )
    .sort((a, b) => {
      const ta = Date.parse(a.executedAt) || 0
      const tb = Date.parse(b.executedAt) || 0
      return ta - tb
    })

  if (!sorted.length) return []

  const ticker = sorted[0].ticker.toUpperCase()
  const sameTicker = sorted.filter((e) => e.ticker.toUpperCase() === ticker)
  const trades: ConsolidatedTrade[] = []

  // Caja mutable: evita narrowing incorrecto de TS con closures
  const state: { current: OpenTradeBuilder | null } = { current: null }

  const pushClosed = () => {
    if (!state.current) return
    trades.push(freezeTrade(state.current, 'CLOSED', eps))
    state.current = null
  }

  const openNew = (
    e: NormalizedExecution,
    direction: TradeDirection,
    key: string,
    qty: number,
    feeShare: number,
  ) => {
    state.current = {
      id: idFactory(),
      ticker,
      direction,
      instrumentType: e.instrumentType,
      baseCurrency: e.baseCurrency,
      quoteCurrency: e.quoteCurrency,
      multiplier: e.multiplier > 0 ? e.multiplier : 1,
      lots: [{ qty, price: e.price, openedAt: e.executedAt, executionKey: key }],
      quantityClosed: 0,
      exitNotional: 0,
      entryNotionalClosed: 0,
      feesTotal: feeShare,
      realizedPnlGross: 0,
      reportedNetPnl: null,
      openedAt: e.executedAt,
      closedAt: null,
      executionKeys: [key],
    }
  }

  /** Cierra `qtyToClose` contra lots FIFO. Retorna cantidad no cubierta (flip). */
  const closeFifo = (e: NormalizedExecution, key: string, qtyToClose: number, feeOnClose: number): number => {
    const cur = state.current
    if (!cur || qtyToClose <= eps) return qtyToClose

    cur.executionKeys.push(key)
    cur.feesTotal += feeOnClose
    if (e.reportedNetPnl !== undefined && Number.isFinite(e.reportedNetPnl)) {
      cur.reportedNetPnl = (cur.reportedNetPnl ?? 0) + e.reportedNetPnl
    }
    let remaining = qtyToClose
    const mult = cur.multiplier > 0 ? cur.multiplier : 1
    const dir = positionSign(cur.direction)

    while (remaining > eps && cur.lots.length > 0) {
      const lot = cur.lots[0]
      const matched = Math.min(lot.qty, remaining)

      // LONG: (exit - entry) * qty * mult; SHORT: (entry - exit) * qty * mult
      cur.realizedPnlGross += dir * (e.price - lot.price) * matched * mult
      cur.exitNotional += matched * e.price
      cur.entryNotionalClosed += matched * lot.price
      cur.quantityClosed += matched
      cur.closedAt = e.executedAt

      lot.qty -= matched
      remaining -= matched
      if (lot.qty <= eps) cur.lots.shift()
    }

    if (openQty(cur.lots) <= eps) {
      cur.lots = []
      pushClosed()
    }

    return remaining
  }

  sameTicker.forEach((e, index) => {
    const key = executionKey(e, index)
    const qty = Math.abs(e.quantity)
    const fee = Number.isFinite(e.fees) ? Math.abs(e.fees) : 0
    const sideSign = signedSide(e.side)

    if (!state.current) {
      openNew(e, sideSign > 0 ? 'LONG' : 'SHORT', key, qty, fee)
      return
    }

    const posSign = positionSign(state.current.direction)
    if (sideSign === posSign) {
      state.current.executionKeys.push(key)
      state.current.feesTotal += fee
      state.current.lots.push({ qty, price: e.price, openedAt: e.executedAt, executionKey: key })
      return
    }

    const leftover = closeFifo(e, key, qty, fee)
    if (leftover > eps) {
      openNew(e, sideSign > 0 ? 'LONG' : 'SHORT', key, leftover, 0)
    }
  })

  if (state.current) {
    const open = state.current
    trades.push(freezeTrade(open, openQty(open.lots) > eps ? 'OPEN' : 'CLOSED', eps))
  }

  return trades
}

/** Particiona por símbolo y concatena round-trips. */
export function groupAllExecutionsIntoTrades(
  executions: NormalizedExecution[],
  options: GroupTradesOptions = {},
): ConsolidatedTrade[] {
  const byTicker = new Map<string, NormalizedExecution[]>()
  for (const e of executions) {
    const t = (e.ticker ?? '').toUpperCase()
    if (!t) continue
    const list = byTicker.get(t) ?? []
    list.push(e)
    byTicker.set(t, list)
  }
  const all: ConsolidatedTrade[] = []
  for (const list of byTicker.values()) {
    all.push(...groupExecutionsIntoTrades(list, options))
  }
  return all.sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt))
}
