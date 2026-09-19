import { startOfDay, startOfYear, subDays, startOfMonth } from 'date-fns'
import type { Cashflow, Trade } from '@/types'
import { closedTrades, tradePnl } from './stats'
import { netCashflow } from './capital'

export type Range = '7d' | '30d' | '90d' | 'mtd' | 'ytd' | 'all'

export const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'mtd', label: 'Mes' },
  { value: 'ytd', label: 'Año' },
  { value: 'all', label: 'Todo' },
]

export const RANGE_HINT: Record<Range, string> = {
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
  mtd: 'este mes',
  ytd: 'este año',
  all: 'todo el historial',
}

export function rangeStart(range: Range): Date | null {
  const now = new Date()
  switch (range) {
    case '7d':
      return startOfDay(subDays(now, 6))
    case '30d':
      return startOfDay(subDays(now, 29))
    case '90d':
      return startOfDay(subDays(now, 89))
    case 'mtd':
      return startOfMonth(now)
    case 'ytd':
      return startOfYear(now)
    default:
      return null
  }
}

/** Equity just before a cutoff date (capital inicial + movimientos + P&L cerrado anterior). */
export function equityBefore(trades: Trade[], cutoff: Date | null, startingBalance: number, cashflows?: Cashflow[]): number {
  const cash = netCashflow(cashflows, cutoff)
  if (!cutoff) return startingBalance + netCashflow(cashflows)
  const s = cutoff.getTime()
  const prior = closedTrades(trades).reduce((sum, t) => {
    const d = new Date(t.exitDate ?? t.entryDate).getTime()
    return d < s ? sum + tradePnl(t) : sum
  }, 0)
  return startingBalance + cash + prior
}

/** Equity at the start of the selected range (capital inicial + movimientos previos + P&L previo). */
export function priorEquity(trades: Trade[], range: Range, startingBalance: number, cashflows?: Cashflow[]): number {
  return equityBefore(trades, rangeStart(range), startingBalance, cashflows)
}

export function filterByRange(trades: Trade[], range: Range): Trade[] {
  const start = rangeStart(range)
  if (!start) return trades
  const s = start.getTime()
  return trades.filter((t) => new Date(t.exitDate ?? t.entryDate).getTime() >= s)
}

export function filterCashflowsByRange(flows: Cashflow[] | undefined, range: Range): Cashflow[] {
  if (!flows?.length) return []
  const start = rangeStart(range)
  if (!start) return flows
  const s = start.getTime()
  return flows.filter((c) => new Date(c.date).getTime() >= s)
}

export function filterCashflowsByPreviousRange(flows: Cashflow[] | undefined, range: Range): Cashflow[] {
  if (!flows?.length) return []
  const start = rangeStart(range)
  const prevStart = previousRangeStart(range)
  if (!start || !prevStart) return []
  const prevEnd = start.getTime()
  const from = prevStart.getTime()
  return flows.filter((c) => {
    const d = new Date(c.date).getTime()
    return d >= from && d < prevEnd
  })
}

/** Start of the previous window of equal length. Null if range is "all". */
export function previousRangeStart(range: Range): Date | null {
  if (range === 'all') return null
  const start = rangeStart(range)
  if (!start) return null
  const duration = Date.now() - start.getTime()
  return new Date(start.getTime() - duration)
}

export function filterByPreviousRange(trades: Trade[], range: Range): Trade[] {
  const start = rangeStart(range)
  const prevStart = previousRangeStart(range)
  if (!start || !prevStart) return []
  const prevEnd = start.getTime()
  const from = prevStart.getTime()
  return trades.filter((t) => {
    const d = new Date(t.exitDate ?? t.entryDate).getTime()
    return d >= from && d < prevEnd
  })
}

export function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}
