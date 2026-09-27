import { describe, expect, it } from 'vitest'
import { tradePnl } from '@/lib/stats'
import { groupExecutionsIntoTrades } from './groupTrades'
import { mapConsolidatedTrades, toStoreTrades } from './tradeMapper'
import type { NormalizedExecution } from './types'

describe('trade mapper (verify script parity)', () => {
  it('mapea cierre FIFO a store con derivados UI', () => {
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
    expect(mapped.length).toBe(1)
    expect(mapped[0].status).toBe('CLOSED')
    expect(mapped[0].isWin).toBe(true)
    expect(mapped[0].durationMinutes).toBe(240)
    expect(mapped[0].market).toBe('Forex')

    const store = toStoreTrades(mapped)
    expect('isWin' in store[0]).toBe(false)
    expect(Math.abs(tradePnl(store[0]) - (mapped[0].pnlOverride ?? 0))).toBeLessThan(1e-6)
  })

  it('parte cierres parciales en dos trades', () => {
    const partial: NormalizedExecution[] = [
      {
        broker: 'XTB',
        ticker: 'AAPL',
        instrumentType: 'STOCK',
        side: 'BUY',
        quantity: 2,
        price: 100,
        fees: 1,
        baseCurrency: 'USD',
        quoteCurrency: 'USD',
        multiplier: 1,
        executedAt: '2024-06-01T10:00:00.000Z',
      },
      {
        broker: 'XTB',
        ticker: 'AAPL',
        instrumentType: 'STOCK',
        side: 'SELL',
        quantity: 1,
        price: 110,
        fees: 1,
        baseCurrency: 'USD',
        quoteCurrency: 'USD',
        multiplier: 1,
        executedAt: '2024-06-02T10:00:00.000Z',
      },
    ]
    const parts = mapConsolidatedTrades(groupExecutionsIntoTrades(partial, { idFactory: () => 'p1' }), {
      broker: 'XTB',
    })
    expect(parts.length).toBe(2)
    expect(parts.some((p) => p.status === 'CLOSED' && p.isWin)).toBe(true)
    expect(parts.some((p) => p.status === 'OPEN')).toBe(true)
  })
})
