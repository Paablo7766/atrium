import { describe, expect, it } from 'vitest'
import { accountEquity } from '@/lib/capital'
import { generateDemoTrades } from '@/lib/demo'
import { computeStats, dailyFlow, dailyPnl, equityCurve, sortByExit, tradePnl, unrealizedPnl } from '@/lib/stats'
import type { Trade } from '@/types'
import { csvToTrades, dedupeTrades, tradesToCsv } from '@/lib/csv'
import { deltaPct, filterByRange, priorEquity } from '@/lib/range'
import { toDateKey } from '@/lib/format'
import type { Cashflow } from '@/types'

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

describe('stats engine (verify script parity)', () => {
  it('coherencia P&L, equity, CSV y cashflows', () => {
    const trades = generateDemoTrades(90, 120, 42)
    const start = 10000
    const stats = computeStats(trades, start)
    const daily = dailyPnl(trades)
    const daySum = [...daily.values()].reduce((s, d) => s + d.pnl, 0)
    const flow = dailyFlow(trades, start)
    const curve = equityCurve(trades, start)
    const lastFlow = flow[flow.length - 1]
    const lastEq = curve[curve.length - 1]
    const closedPnl = trades.reduce((s, t) => s + tradePnl(t), 0)

    expect(near(stats.netPnl, daySum)).toBe(true)
    expect(near(stats.netPnl, closedPnl)).toBe(true)
    expect(near(lastEq.equity, start + stats.netPnl)).toBe(true)
    expect(near(lastFlow.equity, start + stats.netPnl)).toBe(true)
    expect(near(lastFlow.cumPnl, stats.netPnl)).toBe(true)
    expect(near(lastFlow.cumProfit - lastFlow.cumLoss, lastFlow.cumPnl)).toBe(true)
    expect(stats.wins + stats.losses + stats.breakeven).toBe(stats.total)
    expect(stats.tradingDays).toBe(daily.size)

    const mtd = filterByRange(trades, 'mtd')
    const mtdStats = computeStats(mtd, priorEquity(trades, 'mtd', start))
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    let monthPnl = 0
    for (const [k, v] of daily) if (k.startsWith(monthKey)) monthPnl += v.pnl
    expect(near(mtdStats.netPnl, monthPnl)).toBe(true)
    expect(deltaPct(Infinity, 1.5)).toBe(null)

    const csv = tradesToCsv(trades.slice(0, 8))
    const back = csvToTrades(csv)
    expect(back.errors.length).toBe(0)
    expect(back.trades.length).toBe(8)
    expect(back.skippedDuplicates).toBe(0)
    expect(back.trades.every((t, i) => near(tradePnl(t), tradePnl(trades[i]), 0.02))).toBe(true)

    const esCsv = `símbolo,dirección,fecha,precio_entrada,precio_salida,cantidad,resultado
NQ,Long,2026-01-15,100,110,1,200
ES,Corto,2026-01-16,50,40,2,-15`
    const parsedEs = csvToTrades(esCsv)
    expect(parsedEs.trades.length).toBe(2)
    expect(parsedEs.errors.length).toBe(0)
    expect(parsedEs.trades[0].pnlOverride).toBe(200)
    expect(toDateKey(parsedEs.trades[0].entryDate)).toBe('2026-01-15')

    const reimport = csvToTrades(esCsv)
    expect(reimport.trades[0].id).not.toBe(parsedEs.trades[0].id)
    const againstExisting = dedupeTrades(reimport.trades, parsedEs.trades)
    expect(againstExisting.trades.length).toBe(0)
    expect(againstExisting.skipped).toBe(2)
    const twiceInFile = csvToTrades(`${esCsv}\nNQ,Long,2026-01-15,100,110,1,200`)
    expect(twiceInFile.trades.length).toBe(2)
    expect(twiceInFile.skippedDuplicates).toBe(1)

    const flows: Cashflow[] = [
      { id: 'd1', date: '2020-01-01T12:00:00.000Z', kind: 'deposit', amount: 5000, note: '' },
      { id: 'w1', date: '2099-01-01T12:00:00.000Z', kind: 'withdrawal', amount: 1000, note: '' },
    ]
    const withCash = equityCurve(trades, start, flows)
    const flowCash = dailyFlow(trades, start, flows)
    const lastCashEq = withCash[withCash.length - 1]
    const lastCashFlow = flowCash[flowCash.length - 1]
    const expectedEq = accountEquity(start, trades, flows)
    expect(near(lastCashEq.equity, expectedEq)).toBe(true)
    expect(near(lastCashFlow.equity, expectedEq)).toBe(true)
    expect(near(lastCashFlow.cumPnl, stats.netPnl)).toBe(true)

    const closed = sortByExit(trades.filter((t) => t.status === 'CLOSED'))
    const mid = closed[Math.floor(closed.length / 2)]
    const midFlows: Cashflow[] = [
      { id: 'mid', date: mid.exitDate ?? mid.entryDate, kind: 'deposit', amount: 250000, note: '' },
    ]
    const statsMid = computeStats(trades, start, midFlows)
    expect(near(stats.netPnl, statsMid.netPnl)).toBe(true)
    expect(near(stats.sharpe, statsMid.sharpe, 1e-4)).toBe(false)
    expect(csv.includes('setupId') && csv.includes('mistakes') && csv.includes('pnlOverride')).toBe(true)
  })

  it('unrealizedPnl resta solo las comisiones prorrateadas del remanente abierto', () => {
    const openLeg: Trade = {
      id: 'open-remainder',
      symbol: 'AAPL',
      market: 'Acciones',
      direction: 'LONG',
      status: 'OPEN',
      entryDate: '2024-06-01T10:00:00.000Z',
      entryPrice: 100,
      quantity: 40,
      multiplier: 1,
      fees: 40,
      strategy: 'test',
      tags: [],
      notes: '',
      rating: 0,
      createdAt: '2024-06-01T10:00:00.000Z',
      updatedAt: '2024-06-01T10:00:00.000Z',
    }
    const live = 110
    const gross = (live - openLeg.entryPrice) * openLeg.quantity
    expect(unrealizedPnl(openLeg, live)).toBeCloseTo(gross - openLeg.fees!, 6)
    expect(unrealizedPnl(openLeg, live)).toBeCloseTo(360, 6)
  })
})
