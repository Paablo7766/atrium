import { describe, expect, it } from 'vitest'
import { CSVImportEngine } from '@/lib/import/engine'
import { groupExecutionsIntoTrades } from '@/lib/import/groupTrades'
import { parseLocaleNumber } from '@/lib/import/parse'
import type { NormalizedExecution } from '@/lib/import/types'

describe('import engine (verify script parity)', () => {
  it('parse, FIFO y CSV XTB', () => {
    expect(parseLocaleNumber('1.234,56', ',')).toBe(1234.56)
    expect(parseLocaleNumber('1,234.56', '.')).toBe(1234.56)
    expect(parseLocaleNumber('(100,5)', ',')).toBe(-100.5)
    expect(parseLocaleNumber('')).toBe(null)
    expect(parseLocaleNumber('n/a')).toBe(null)

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
    expect(trades.length).toBe(1)
    const t = trades[0]
    expect(t.status).toBe('OPEN')
    expect(t.quantity).toBe(5)
    expect(t.quantityClosed).toBe(15)
    expect(Math.abs((t.netPnl ?? 0) - 246.5)).toBeLessThan(1e-6)
    expect(Math.abs(t.avgEntryPrice - 110)).toBeLessThan(1e-6)

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
    expect(closed.length).toBe(1)
    expect(closed[0].status).toBe('CLOSED')
    expect(closed[0].quantity).toBe(0)

    const xtbCsv = `Symbol;Type;Volume;Open Price;Open Time;Commission
EURUSD;buy;1,00;1,08500;15.03.2024 10:00:00;2,50
EURUSD;sell;1,00;1,09000;16.03.2024 11:00:00;2,50
`
    const engine = new CSVImportEngine()
    const result = engine.importAndGroup(xtbCsv, 'XTB')
    expect(result.executions.length).toBe(2)
    expect(result.trades.length).toBe(1)
    expect(result.trades[0].status).toBe('CLOSED')
    expect(result.trades[0].direction).toBe('LONG')
    expect(Math.abs((result.trades[0].avgEntryPrice ?? 0) - 1.085)).toBeLessThan(1e-9)
    expect(Math.abs((result.trades[0].avgExitPrice ?? 0) - 1.09)).toBeLessThan(1e-9)
    expect(Math.abs((result.trades[0].netPnl ?? 0) - -4.995)).toBeLessThan(1e-6)
  })
})
