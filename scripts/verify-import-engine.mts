/**
 * Smoke test del motor de importación + FIFO.
 * Run: npx --yes tsx scripts/verify-import-engine.mts
 */
import { CSVImportEngine } from '../src/lib/import/engine.ts'
import { groupExecutionsIntoTrades } from '../src/lib/import/groupTrades.ts'
import { parseLocaleNumber } from '../src/lib/import/parse.ts'
import type { NormalizedExecution } from '../src/lib/import/types.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

// --- numbers ---
assert(parseLocaleNumber('1.234,56', ',') === 1234.56, 'EU number')
assert(parseLocaleNumber('1,234.56', '.') === 1234.56, 'US number')
assert(parseLocaleNumber('(100,5)', ',') === -100.5, 'paren negative')
assert(parseLocaleNumber('') === null, 'empty → null')
assert(parseLocaleNumber('n/a') === null, 'n/a → null')

// --- FIFO long round-trip ---
const fills: NormalizedExecution[] = [
  {
    broker: 'MANUAL',
    ticker: 'AAPL',
    instrumentType: 'STOCK',
    side: 'BUY',
    quantity: 10,
    price: 100,
    fees: 1,
    baseCurrency: 'USD',
    quoteCurrency: 'USD',
    multiplier: 1,
    executedAt: '2024-01-01T10:00:00.000Z',
  },
  {
    broker: 'MANUAL',
    ticker: 'AAPL',
    instrumentType: 'STOCK',
    side: 'BUY',
    quantity: 10,
    price: 110,
    fees: 1,
    baseCurrency: 'USD',
    quoteCurrency: 'USD',
    multiplier: 1,
    executedAt: '2024-01-02T10:00:00.000Z',
  },
  {
    broker: 'MANUAL',
    ticker: 'AAPL',
    instrumentType: 'STOCK',
    side: 'SELL',
    quantity: 15,
    price: 120,
    fees: 1.5,
    baseCurrency: 'USD',
    quoteCurrency: 'USD',
    multiplier: 1,
    executedAt: '2024-01-03T10:00:00.000Z',
  },
]

const trades = groupExecutionsIntoTrades(fills, { idFactory: () => 't1' })
assert(trades.length === 1, `expected 1 trade, got ${trades.length}`)
const t = trades[0]
assert(t.status === 'OPEN', 'partial close → still OPEN')
assert(t.quantity === 5, `remaining qty 5, got ${t.quantity}`)
assert(t.quantityClosed === 15, `closed 15, got ${t.quantityClosed}`)
// FIFO: 10@100 + 5@110 closed; exit 120
// PnL gross = 10*(120-100) + 5*(120-110) = 200+50 = 250; fees = 3.5 → 246.5
assert(Math.abs((t.netPnl ?? 0) - 246.5) < 1e-6, `netPnl ~246.5 got ${t.netPnl}`)
assert(Math.abs(t.avgEntryPrice - 110) < 1e-6, `open avg entry 110 got ${t.avgEntryPrice}`)

// full close remainder
const closeRest: NormalizedExecution[] = [
  ...fills,
  {
    broker: 'MANUAL',
    ticker: 'AAPL',
    instrumentType: 'STOCK',
    side: 'SELL',
    quantity: 5,
    price: 115,
    fees: 0.5,
    baseCurrency: 'USD',
    quoteCurrency: 'USD',
    multiplier: 1,
    executedAt: '2024-01-04T10:00:00.000Z',
  },
]
const closed = groupExecutionsIntoTrades(closeRest, { idFactory: () => 't2' })
assert(closed.length === 1 && closed[0].status === 'CLOSED', 'fully closed')
assert(closed[0].quantity === 0, 'qty 0 when closed')

// --- CSV engine smoke (XTB-like) ---
const xtbCsv = `Symbol;Type;Volume;Open Price;Open Time;Commission
EURUSD;buy;1,00;1,08500;15.03.2024 10:00:00;2,50
EURUSD;sell;1,00;1,09000;16.03.2024 11:00:00;2,50
`
const engine = new CSVImportEngine()
const result = engine.importAndGroup(xtbCsv, 'XTB')
assert(result.executions.length === 2, `XTB execs 2 got ${result.executions.length}`)
assert(result.trades.length === 1, `XTB trades 1 got ${result.trades.length}`)
assert(result.trades[0].status === 'CLOSED', 'XTB round-trip closed')
assert(result.trades[0].direction === 'LONG', 'XTB long')
assert(Math.abs((result.trades[0].avgEntryPrice ?? 0) - 1.085) < 1e-9, 'XTB avg entry')
assert(Math.abs((result.trades[0].avgExitPrice ?? 0) - 1.09) < 1e-9, 'XTB avg exit')
// PnL = (1.09 - 1.085) * 1 - 5 = -4.995
assert(Math.abs((result.trades[0].netPnl ?? 0) - -4.995) < 1e-6, `XTB pnl got ${result.trades[0].netPnl}`)

console.log('verify-import-engine: OK')
console.log(
  JSON.stringify(
    {
      partial: { qty: t.quantity, closed: t.quantityClosed, netPnl: t.netPnl },
      xtb: { pnl: result.trades[0].netPnl, avgEntry: result.trades[0].avgEntryPrice, avgExit: result.trades[0].avgExitPrice },
    },
    null,
    2,
  ),
)
