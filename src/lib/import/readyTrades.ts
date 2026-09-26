import { createId } from './parse'
import type { ConsolidatedTrade, GroupTradesOptions, NormalizedExecution, ReadyTradeInput } from './types'
import { groupAllExecutionsIntoTrades } from './groupTrades'

const EPS = 1e-8

/** Adaptadores que emiten fills sueltos (pasar por FIFO). */
export const FIFO_FILL_ADAPTERS = ['INTERACTIVE_BROKERS', 'DEGIRO', 'FOMO', 'AXIOM'] as const

/** Adaptadores que emiten operaciones ya formadas (Closed/Open; futuro MT4/MT5). */
export const READY_POSITION_ADAPTERS = ['XTB'] as const

function isValidReadyTrade(t: ReadyTradeInput): boolean {
  if (!t.ticker?.trim()) return false
  if (!Number.isFinite(t.avgEntryPrice) || t.avgEntryPrice < 0) return false
  if (!t.openedAt || Number.isNaN(Date.parse(t.openedAt))) return false
  if (t.status === 'CLOSED') {
    if (t.quantityClosed <= EPS) return false
    if (t.avgExitPrice == null || !Number.isFinite(t.avgExitPrice) || t.avgExitPrice < 0) return false
    if (!t.closedAt || Number.isNaN(Date.parse(t.closedAt))) return false
  } else if (t.quantity <= EPS) {
    return false
  }
  return true
}

/**
 * Convierte trades ya formados por el bróker en ConsolidatedTrade 1:1.
 * No empareja, no FIFO, no fusiona por ticker ni por Position ID.
 */
export function finalizeReadyTrades(
  inputs: ReadyTradeInput[],
  options: GroupTradesOptions = {},
): ConsolidatedTrade[] {
  const idFactory = options.idFactory ?? createId
  return inputs.filter(isValidReadyTrade).map((t) => {
    const closed = t.status === 'CLOSED'
    return {
      id: idFactory(),
      ticker: t.ticker.trim().toUpperCase(),
      instrumentType: t.instrumentType,
      direction: t.direction === 'SHORT' ? 'SHORT' : 'LONG',
      status: closed ? 'CLOSED' : 'OPEN',
      quantity: closed ? 0 : Math.abs(t.quantity),
      quantityClosed: closed ? Math.abs(t.quantityClosed) : 0,
      avgEntryPrice: t.avgEntryPrice,
      avgExitPrice: closed ? t.avgExitPrice : null,
      feesTotal: Number.isFinite(t.feesTotal) ? Math.abs(t.feesTotal) : 0,
      netPnl: closed && t.netPnl != null && Number.isFinite(t.netPnl) ? t.netPnl : null,
      baseCurrency: (t.baseCurrency || 'USD').toUpperCase().slice(0, 3),
      quoteCurrency: (t.quoteCurrency || 'USD').toUpperCase().slice(0, 3),
      multiplier: t.multiplier > 0 && Number.isFinite(t.multiplier) ? t.multiplier : 1,
      openedAt: t.openedAt,
      closedAt: closed ? (t.closedAt ?? t.openedAt) : null,
      executionKeys: t.externalId?.trim() ? [t.externalId.trim()] : [],
    }
  })
}

/**
 * Junta ambos caminos: ready trades tal cual + fills agrupados por FIFO.
 * Nunca mete una fila CLOSED/OPEN de XTB en el mismo libro FIFO que otra del mismo ticker.
 */
export function assembleImportTrades(
  executions: NormalizedExecution[],
  readyTrades: ReadyTradeInput[],
  options: GroupTradesOptions = {},
): ConsolidatedTrade[] {
  const fromReady = finalizeReadyTrades(readyTrades, options)
  const fromFills = groupAllExecutionsIntoTrades(executions, options)
  return [...fromReady, ...fromFills].sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt))
}
