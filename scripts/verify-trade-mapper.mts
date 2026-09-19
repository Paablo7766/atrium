/**
 * Smoke: ConsolidatedTrade → store Trade + derivados UI.
 * Run: npx --yes tsx scripts/verify-trade-mapper.mts
 */
import { groupExecutionsIntoTrades } from '../src/lib/import/groupTrades.ts'
import { mapConsolidatedTrades, toStoreTrades } from '../src/lib/import/tradeMapper.ts'
import type { NormalizedExecution } from '../src/lib/import/types.ts'
import { tradePnl } from '../src/lib/stats.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const fills: NormalizedExecution[] = [
  {
    broker: 'XTB',
    ticker: 'EURUSD',
    instrumentType: 'FOREX',
    side: 'BUY',
    quantity: 1,
    price: 1.1,
    fees: 2,
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
    multiplier: 100000,
    executedAt: '2024-06-01T10:00:00.000Z',
  },
  {
    broker: 'XTB',
    ticker: 'EURUSD',
    instrumentType: 'FOREX',
    side: 'SELL',
    quantity: 1,
    price: 1.12,
    fees: 2,
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
    multiplier: 100000,
    executedAt: '2024-06-01T14:00:00.000Z',
  },
]

const consolidated = groupExecutionsIntoTrades(fills, { idFactory: () => 'ct1' })
const mapped = mapConsolidatedTrades(consolidated, { broker: 'XTB' })
assert(mapped.length === 1, 'one mapped trade')
assert(mapped[0].status === 'CLOSED', 'closed')
assert(mapped[0].isWin === true, 'isWin')
assert(mapped[0].isLoss === false, 'not loss')
assert(mapped[0].durationMinutes === 240, `duration 240 got ${mapped[0].durationMinutes}`)
assert(mapped[0].market === 'Forex', 'forex market')
assert(mapped[0].pnlOverride != null, 'pnlOverride set')

const store = toStoreTrades(mapped)
assert(!('isWin' in store[0]), 'store trade without isWin')
assert(Math.abs(tradePnl(store[0]) - (mapped[0].pnlOverride ?? 0)) < 1e-6, 'pnl matches override')

// partial → 2 legs
const partial: NormalizedExecution[] = [
  { ...fills[0], quantity: 2, price: 100, multiplier: 1, ticker: 'AAPL', instrumentType: 'STOCK', fees: 1 },
  {
    ...fills[1],
    quantity: 1,
    price: 110,
    multiplier: 1,
    ticker: 'AAPL',
    instrumentType: 'STOCK',
    fees: 1,
    executedAt: '2024-06-02T10:00:00.000Z',
  },
]
const parts = mapConsolidatedTrades(groupExecutionsIntoTrades(partial, { idFactory: () => 'p1' }), { broker: 'XTB' })
assert(parts.length === 2, `partial split 2 got ${parts.length}`)
assert(parts.some((p) => p.status === 'CLOSED' && p.isWin), 'closed win leg')
assert(parts.some((p) => p.status === 'OPEN'), 'open remainder')

console.log('verify-trade-mapper: OK', {
  closed: { pnl: mapped[0].pnlOverride, mins: mapped[0].durationMinutes },
  partial: parts.map((p) => ({ status: p.status, qty: p.quantity, isWin: p.isWin })),
})
