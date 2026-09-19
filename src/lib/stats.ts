import type { Cashflow, Trade } from '@/types'
import { toDateKey } from './format'

function signedFlow(c: Cashflow): number {
  const amt = Math.abs(c.amount)
  return c.kind === 'withdrawal' ? -amt : amt
}

type TimelineEvent = { t: number; kind: 'trade'; trade: Trade } | { t: number; kind: 'cash'; flow: Cashflow }

function timeline(trades: Trade[], cashflows: Cashflow[] = []): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const trade of sortByExit(closedTrades(trades))) {
    events.push({ t: new Date(trade.exitDate ?? trade.entryDate).getTime(), kind: 'trade', trade })
  }
  for (const flow of cashflows) {
    const t = new Date(flow.date).getTime()
    if (Number.isFinite(t)) events.push({ t, kind: 'cash', flow })
  }
  events.sort((a, b) => a.t - b.t)
  return events
}

// ---------- Cálculos por operación ----------

export function tradePnl(t: Trade): number {
  if (t.status !== 'CLOSED') return 0
  if (t.pnlOverride !== undefined && Number.isFinite(t.pnlOverride)) return t.pnlOverride
  if (t.exitPrice === undefined) return 0
  if (t.direction !== 'LONG' && t.direction !== 'SHORT') return 0
  const dir = t.direction === 'SHORT' ? -1 : 1
  const gross = (t.exitPrice - t.entryPrice) * dir * t.quantity * (t.multiplier || 1)
  return gross - (t.fees || 0)
}

export function tradeGrossPnl(t: Trade): number {
  return tradePnl(t) + (t.fees || 0)
}

export function tradeRisk(t: Trade): number | null {
  if (t.stopLoss === undefined || !Number.isFinite(t.stopLoss)) return null
  const risk = Math.abs(t.entryPrice - t.stopLoss) * t.quantity * (t.multiplier || 1)
  return risk > 0 ? risk : null
}

export function tradeR(t: Trade): number | null {
  const risk = tradeRisk(t)
  if (!risk || t.status !== 'CLOSED') return null
  return tradePnl(t) / risk
}

export function tradeReturnPct(t: Trade): number | null {
  if (t.status !== 'CLOSED' || t.exitPrice === undefined || !t.entryPrice) return null
  if (t.direction !== 'LONG' && t.direction !== 'SHORT') return null
  const dir = t.direction === 'SHORT' ? -1 : 1
  return ((t.exitPrice - t.entryPrice) / t.entryPrice) * dir * 100
}

export function tradeDurationMs(t: Trade): number {
  if (!t.exitDate) return 0
  return new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime()
}

export function tradeOutcome(t: Trade): 'WIN' | 'LOSS' | 'BE' | 'OPEN' {
  if (t.status !== 'CLOSED') return 'OPEN'
  const p = tradePnl(t)
  if (p > 0) return 'WIN'
  if (p < 0) return 'LOSS'
  return 'BE'
}

export function closedTrades(trades: Trade[]) {
  return trades.filter((t) => t.status === 'CLOSED')
}

export function sortByExit(trades: Trade[]) {
  return [...trades].sort((a, b) => {
    const da = new Date(a.exitDate ?? a.entryDate).getTime()
    const db = new Date(b.exitDate ?? b.entryDate).getTime()
    return da - db
  })
}

// ---------- Estadísticas agregadas ----------

export interface Stats {
  total: number
  wins: number
  losses: number
  breakeven: number
  open: number
  netPnl: number
  grossProfit: number
  grossLoss: number
  fees: number
  winRate: number
  profitFactor: number
  expectancy: number
  avgWin: number
  avgLoss: number
  avgTrade: number
  largestWin: number
  largestLoss: number
  avgR: number
  totalR: number
  rCount: number
  maxDrawdown: number
  maxDrawdownPct: number
  currentStreak: number // + ganadora, - perdedora
  bestStreak: number
  worstStreak: number
  avgDurationMs: number
  payoffRatio: number
  sharpe: number
  longCount: number
  shortCount: number
  longPnl: number
  shortPnl: number
  bestDay: { date: string; pnl: number } | null
  worstDay: { date: string; pnl: number } | null
  tradingDays: number
  avgDailyPnl: number
  greenDays: number
  redDays: number
}

export function computeStats(trades: Trade[], startingBalance = 0, cashflows: Cashflow[] = []): Stats {
  const closed = sortByExit(closedTrades(trades))
  const pnls = closed.map(tradePnl)
  const wins = pnls.filter((p) => p > 0)
  const losses = pnls.filter((p) => p < 0)
  const be = pnls.filter((p) => p === 0)
  const grossProfit = wins.reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0))
  const netPnl = grossProfit - grossLoss
  const fees = closed.reduce((a, t) => a + (t.fees || 0), 0)
  const decided = wins.length + losses.length
  const winRate = decided ? (wins.length / decided) * 100 : 0
  const avgWin = wins.length ? grossProfit / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const expectancy = closed.length ? netPnl / closed.length : 0

  const rs = closed.map(tradeR).filter((r): r is number => r !== null)
  const totalR = rs.reduce((a, b) => a + b, 0)
  const avgR = rs.length ? totalR / rs.length : 0

  // Drawdown sobre equity de cuenta (P&L + depósitos/retiradas)
  let equity = startingBalance
  let peak = startingBalance
  let maxDD = 0
  let maxDDPct = 0
  for (const ev of timeline(trades, cashflows)) {
    equity += ev.kind === 'trade' ? tradePnl(ev.trade) : signedFlow(ev.flow)
    if (equity > peak) peak = equity
    const dd = peak - equity
    if (dd > maxDD) {
      maxDD = dd
      maxDDPct = peak > 0 ? (dd / peak) * 100 : 0
    }
  }

  // Rachas
  let current = 0
  let best = 0
  let worst = 0
  for (const p of pnls) {
    if (p > 0) current = current > 0 ? current + 1 : 1
    else if (p < 0) current = current < 0 ? current - 1 : -1
    else continue
    if (current > best) best = current
    if (current < worst) worst = current
  }

  const durations = closed.map(tradeDurationMs).filter((d) => d > 0)
  const avgDurationMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

  const longs = closed.filter((t) => t.direction === 'LONG')
  const shorts = closed.filter((t) => t.direction === 'SHORT')

  const daily = dailyPnl(closed)
  const days = [...daily.entries()]
  // Retornos diarios sobre equity de cuenta (mismo ledger que el drawdown).
  // El numerador es solo P&L de trading; un depósito no cuenta como rentabilidad.
  let eq = startingBalance
  const rets: number[] = []
  for (const pt of dailyFlow(closed, startingBalance, cashflows)) {
    if (pt.count > 0 && Math.abs(eq) > 1e-9) rets.push(pt.pnl / eq)
    eq = pt.equity
  }
  const meanRet = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0
  const varRet = rets.length > 1 ? rets.reduce((a, r) => a + (r - meanRet) ** 2, 0) / (rets.length - 1) : 0
  const stdRet = Math.sqrt(varRet)
  const sharpe = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(252) : 0

  const bestDay = days.length ? days.reduce((a, b) => (b[1].pnl > a[1].pnl ? b : a)) : null
  const worstDay = days.length ? days.reduce((a, b) => (b[1].pnl < a[1].pnl ? b : a)) : null
  const greenDays = days.filter(([, v]) => v.pnl > 0).length
  const redDays = days.filter(([, v]) => v.pnl < 0).length

  return {
    total: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: be.length,
    open: trades.filter((t) => t.status === 'OPEN').length,
    netPnl,
    grossProfit,
    grossLoss,
    fees,
    winRate,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    avgTrade: expectancy,
    largestWin: wins.length ? Math.max(...wins) : 0,
    largestLoss: losses.length ? Math.min(...losses) : 0,
    avgR,
    totalR,
    rCount: rs.length,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    currentStreak: current,
    bestStreak: best,
    worstStreak: worst,
    avgDurationMs,
    payoffRatio: avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0,
    sharpe,
    longCount: longs.length,
    shortCount: shorts.length,
    longPnl: longs.reduce((a, t) => a + tradePnl(t), 0),
    shortPnl: shorts.reduce((a, t) => a + tradePnl(t), 0),
    bestDay: bestDay ? { date: bestDay[0], pnl: bestDay[1].pnl } : null,
    worstDay: worstDay ? { date: worstDay[0], pnl: worstDay[1].pnl } : null,
    tradingDays: days.length,
    avgDailyPnl: days.length ? netPnl / days.length : 0,
    greenDays,
    redDays,
  }
}

// ---------- Series ----------

export interface EquityPoint {
  date: string // ISO
  equity: number
  pnl: number
  cumPnl: number
  drawdown: number
  tradeId: string
  symbol: string
  kind?: 'trade' | 'cash'
}

export function equityCurve(trades: Trade[], startingBalance = 0, cashflows: Cashflow[] = []): EquityPoint[] {
  let equity = startingBalance
  let cum = 0
  let peak = startingBalance
  const pts: EquityPoint[] = []
  for (const ev of timeline(trades, cashflows)) {
    if (ev.kind === 'trade') {
      const p = tradePnl(ev.trade)
      equity += p
      cum += p
      if (equity > peak) peak = equity
      pts.push({
        date: ev.trade.exitDate ?? ev.trade.entryDate,
        equity,
        pnl: p,
        cumPnl: cum,
        drawdown: equity - peak,
        tradeId: ev.trade.id,
        symbol: ev.trade.symbol,
        kind: 'trade',
      })
    } else {
      const p = signedFlow(ev.flow)
      equity += p
      if (equity > peak) peak = equity
      pts.push({
        date: ev.flow.date,
        equity,
        pnl: p,
        cumPnl: cum,
        drawdown: equity - peak,
        tradeId: ev.flow.id,
        symbol: ev.flow.kind === 'deposit' ? 'Depósito' : 'Retirada',
        kind: 'cash',
      })
    }
  }
  return pts
}

export interface FlowPoint {
  date: string
  dateKey: string
  equity: number
  cumPnl: number
  cumProfit: number
  cumLoss: number
  pnl: number
  dayProfit: number
  dayLoss: number
  count: number
  wins: number
  losses: number
  drawdown: number
}

export function dailyFlow(trades: Trade[], startingBalance = 0, cashflows: Cashflow[] = []): FlowPoint[] {
  const map = dailyPnl(trades)
  const flowByDay = new Map<string, number>()
  for (const c of cashflows) {
    const key = toDateKey(c.date)
    flowByDay.set(key, (flowByDay.get(key) ?? 0) + signedFlow(c))
  }
  const days = [...new Set([...map.keys(), ...flowByDay.keys()])].sort()
  let equity = startingBalance
  let cum = 0
  let cumProfit = 0
  let cumLoss = 0
  let peak = startingBalance
  const pts: FlowPoint[] = []
  for (const date of days) {
    const a = map.get(date)
    const cash = flowByDay.get(date) ?? 0
    const dayProfit = a ? a.trades.reduce((s, t) => s + Math.max(0, tradePnl(t)), 0) : 0
    const dayLoss = a ? a.trades.reduce((s, t) => s + Math.max(0, -tradePnl(t)), 0) : 0
    const tradePnlDay = a?.pnl ?? 0
    equity += tradePnlDay + cash
    cum += tradePnlDay
    cumProfit += dayProfit
    cumLoss += dayLoss
    if (equity > peak) peak = equity
    pts.push({
      date: `${date}T12:00:00`,
      dateKey: date,
      equity,
      cumPnl: cum,
      cumProfit,
      cumLoss,
      pnl: tradePnlDay,
      dayProfit,
      dayLoss,
      count: a?.count ?? 0,
      wins: a?.wins ?? 0,
      losses: a?.losses ?? 0,
      drawdown: peak - equity,
    })
  }
  return pts
}

export interface DayAgg {
  pnl: number
  count: number
  wins: number
  losses: number
  trades: Trade[]
}

export function dailyPnl(trades: Trade[]): Map<string, DayAgg> {
  const map = new Map<string, DayAgg>()
  for (const t of closedTrades(trades)) {
    const key = toDateKey(t.exitDate ?? t.entryDate)
    const p = tradePnl(t)
    const cur = map.get(key) ?? { pnl: 0, count: 0, wins: 0, losses: 0, trades: [] }
    cur.pnl += p
    cur.count += 1
    if (p > 0) cur.wins += 1
    if (p < 0) cur.losses += 1
    cur.trades.push(t)
    map.set(key, cur)
  }
  return map
}

export interface GroupPerf {
  key: string
  count: number
  wins: number
  losses: number
  pnl: number
  winRate: number
  avgPnl: number
  avgR: number | null
  profitFactor: number
  /** Suma de P&L positivos (bruto de ganancias). */
  grossProfit: number
  /** Valor absoluto de la suma de P&L negativos. */
  grossLoss: number
}

export function emptyGroupPerf(key: string): GroupPerf {
  return {
    key,
    count: 0,
    wins: 0,
    losses: 0,
    pnl: 0,
    winRate: 0,
    avgPnl: 0,
    avgR: null,
    profitFactor: 0,
    grossProfit: 0,
    grossLoss: 0,
  }
}

export function groupPerformance(trades: Trade[], keyFn: (t: Trade) => string | undefined): GroupPerf[] {
  const groups = new Map<string, Trade[]>()
  for (const t of closedTrades(trades)) {
    const k = keyFn(t)
    if (!k) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(t)
  }
  const out: GroupPerf[] = []
  for (const [key, list] of groups) {
    const pnls = list.map(tradePnl)
    const wins = pnls.filter((p) => p > 0)
    const losses = pnls.filter((p) => p < 0)
    const gp = wins.reduce((a, b) => a + b, 0)
    const gl = Math.abs(losses.reduce((a, b) => a + b, 0))
    const decided = wins.length + losses.length
    const rs = list.map(tradeR).filter((r): r is number => r !== null)
    out.push({
      key,
      count: list.length,
      wins: wins.length,
      losses: losses.length,
      pnl: pnls.reduce((a, b) => a + b, 0),
      winRate: decided ? (wins.length / decided) * 100 : 0,
      avgPnl: list.length ? pnls.reduce((a, b) => a + b, 0) / list.length : 0,
      avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0,
      grossProfit: gp,
      grossLoss: gl,
    })
  }
  return out.sort((a, b) => b.pnl - a.pnl)
}

export function uniqueValues(trades: Trade[], pick: (t: Trade) => string | undefined) {
  const set = new Set<string>()
  for (const t of trades) {
    const v = pick(t)
    if (v) set.add(v)
  }
  return [...set].sort()
}
