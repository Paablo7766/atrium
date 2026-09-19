import type { Cashflow, Trade } from '@/types'
import { closedTrades, tradePnl } from './stats'

export function signedCashflow(c: Cashflow): number {
  const amt = Math.abs(c.amount)
  return c.kind === 'withdrawal' ? -amt : amt
}

export function netCashflow(flows: Cashflow[] | undefined, cutoff?: Date | null): number {
  if (!flows?.length) return 0
  const limit = cutoff ? cutoff.getTime() : null
  return flows.reduce((sum, c) => {
    if (limit !== null && new Date(c.date).getTime() >= limit) return sum
    return sum + signedCashflow(c)
  }, 0)
}

export function netTradingPnl(trades: Trade[]): number {
  return closedTrades(trades).reduce((sum, t) => sum + tradePnl(t), 0)
}

export function accountEquity(startingBalance: number, trades: Trade[], cashflows?: Cashflow[]): number {
  return startingBalance + netCashflow(cashflows) + netTradingPnl(trades)
}

export function suggestedQuantity(opts: {
  equity: number
  riskPct: number
  entry: number
  stop: number
  multiplier: number
}): { qty: number; riskMoney: number; stopDistance: number } | null {
  const { equity, riskPct, entry, stop, multiplier } = opts
  if (!(equity > 0) || !(riskPct > 0) || !(multiplier > 0)) return null
  if (!(entry > 0) || !Number.isFinite(stop)) return null
  const stopDistance = Math.abs(entry - stop)
  if (!(stopDistance > 0)) return null
  const riskMoney = equity * (riskPct / 100)
  const perUnit = stopDistance * multiplier
  const raw = riskMoney / perUnit
  if (!Number.isFinite(raw) || raw <= 0) return null
  const qty = raw >= 10 ? Math.round(raw) : raw >= 1 ? Math.round(raw * 10) / 10 : Math.round(raw * 100) / 100
  return { qty, riskMoney, stopDistance }
}
