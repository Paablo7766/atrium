import { generateDemoTrades } from '../src/lib/demo.ts'
import { computeStats, dailyFlow, dailyPnl, equityCurve, sortByExit, tradePnl } from '../src/lib/stats.ts'
import { csvToTrades, dedupeTrades, tradesToCsv } from '../src/lib/csv.ts'
import { deltaPct, filterByRange, priorEquity } from '../src/lib/range.ts'
import { toDateKey } from '../src/lib/format.ts'
import { accountEquity } from '../src/lib/capital.ts'
import type { Cashflow } from '../src/types.ts'

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps
const ok = (name: string, cond: boolean) => {
  if (!cond) throw new Error(`FAIL: ${name}`)
  console.log('ok', name)
}

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

ok('netPnl === suma diaria', near(stats.netPnl, daySum))
ok('netPnl === suma operaciones', near(stats.netPnl, closedPnl))
ok('último equity curva === capital + P&L', near(lastEq.equity, start + stats.netPnl))
ok('último equity flujo === capital + P&L', near(lastFlow.equity, start + stats.netPnl))
ok('último cumPnl flujo === netPnl', near(lastFlow.cumPnl, stats.netPnl))
ok('flujo ganancias − pérdidas === cumPnl', near(lastFlow.cumProfit - lastFlow.cumLoss, lastFlow.cumPnl))
ok('wins+losses+BE === cerradas', stats.wins + stats.losses + stats.breakeven === stats.total)
ok('tradingDays === días con cierre', stats.tradingDays === daily.size)

const mtd = filterByRange(trades, 'mtd')
const mtdStats = computeStats(mtd, priorEquity(trades, 'mtd', start))
const now = new Date()
const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
let monthPnl = 0
for (const [k, v] of daily) if (k.startsWith(monthKey)) monthPnl += v.pnl
ok('P&L mes calendario === filtro Mes', near(mtdStats.netPnl, monthPnl))

ok('PF infinito no da tendencia falsa', deltaPct(Infinity, 1.5) === null)

const csv = tradesToCsv(trades.slice(0, 8))
const back = csvToTrades(csv)
ok('CSV roundtrip sin errores', back.errors.length === 0 && back.trades.length === 8 && back.skippedDuplicates === 0)
ok(
  'CSV roundtrip conserva P&L',
  back.trades.every((t, i) => near(tradePnl(t), tradePnl(trades[i]), 0.02)),
)

const esCsv = `símbolo,dirección,fecha,precio_entrada,precio_salida,cantidad,resultado
NQ,Long,2026-01-15,100,110,1,200
ES,Corto,2026-01-16,50,40,2,-15`
const parsedEs = csvToTrades(esCsv)
ok('CSV cabeceras en español', parsedEs.trades.length === 2 && parsedEs.errors.length === 0)
ok('CSV español respeta P&L manual', parsedEs.trades[0].pnlOverride === 200)
ok('CSV fecha sin hora queda el mismo día local', toDateKey(parsedEs.trades[0].entryDate) === '2026-01-15')

const reimport = csvToTrades(esCsv)
ok('reparse CSV genera ids distintos', reimport.trades[0].id !== parsedEs.trades[0].id)
const againstExisting = dedupeTrades(reimport.trades, parsedEs.trades)
ok('reimportar el mismo CSV no duplica', againstExisting.trades.length === 0 && againstExisting.skipped === 2)
const twiceInFile = csvToTrades(`${esCsv}\nNQ,Long,2026-01-15,100,110,1,200`)
ok('duplicado dentro del archivo se omite', twiceInFile.trades.length === 2 && twiceInFile.skippedDuplicates === 1)

const flows: Cashflow[] = [
  { id: 'd1', date: '2020-01-01T12:00:00.000Z', kind: 'deposit', amount: 5000, note: '' },
  { id: 'w1', date: '2099-01-01T12:00:00.000Z', kind: 'withdrawal', amount: 1000, note: '' },
]
const withCash = equityCurve(trades, start, flows)
const flowCash = dailyFlow(trades, start, flows)
const lastCashEq = withCash[withCash.length - 1]
const lastCashFlow = flowCash[flowCash.length - 1]
const expectedEq = accountEquity(start, trades, flows)
ok('curva con cashflows === equity de cuenta', near(lastCashEq.equity, expectedEq))
ok('flujo con cashflows === equity de cuenta', near(lastCashFlow.equity, expectedEq))
ok('cumPnl ignora depósitos', near(lastCashFlow.cumPnl, stats.netPnl))

const closed = sortByExit(trades.filter((t) => t.status === 'CLOSED'))
const mid = closed[Math.floor(closed.length / 2)]
const midFlows: Cashflow[] = [
  { id: 'mid', date: mid.exitDate ?? mid.entryDate, kind: 'deposit', amount: 250000, note: '' },
]
const statsMid = computeStats(trades, start, midFlows)
ok('netPnl ignora depósito a mitad', near(stats.netPnl, statsMid.netPnl))
ok('depósito a mitad cambia el Sharpe', !near(stats.sharpe, statsMid.sharpe, 1e-4))
ok('CSV exporta setup y errores', csv.includes('setupId') && csv.includes('mistakes') && csv.includes('pnlOverride'))

console.log('ALL PASSED', { netPnl: stats.netPnl, trades: stats.total, days: stats.tradingDays })
