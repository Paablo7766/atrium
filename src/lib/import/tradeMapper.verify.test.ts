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

  it('prorratea comisiones y pnlOverride 60/40 en cierre parcial (100 → 60 cerradas)', () => {
    const fills: NormalizedExecution[] = [
      {
        broker: 'XTB',
        ticker: 'AAPL',
        instrumentType: 'STOCK',
        side: 'BUY',
        quantity: 100,
        price: 100,
        fees: 50,
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
        quantity: 60,
        price: 110,
        fees: 50,
        baseCurrency: 'USD',
        quoteCurrency: 'USD',
        multiplier: 1,
        executedAt: '2024-06-02T10:00:00.000Z',
      },
    ]
    const [ct] = groupExecutionsIntoTrades(fills, { idFactory: () => 'ct-partial' })
    expect(ct.status).toBe('OPEN')
    expect(ct.quantityClosed).toBe(60)
    expect(ct.quantity).toBe(40)
    expect(ct.feesTotal).toBe(100)

    const mapped = mapConsolidatedTrades([ct], { broker: 'XTB' })
    const closed = mapped.find((p) => p.status === 'CLOSED')
    const open = mapped.find((p) => p.status === 'OPEN')
    expect(closed).toBeDefined()
    expect(open).toBeDefined()

    expect(closed!.fees).toBeCloseTo(60, 6)
    expect(open!.fees).toBeCloseTo(40, 6)
    expect(closed!.fees! + open!.fees!).toBeCloseTo(ct.feesTotal, 6)

    const netRealized = ct.netPnl!
    expect(closed!.pnlOverride).toBeCloseTo(netRealized * 0.6, 6)
    expect(open!.pnlOverride).toBeUndefined()

    expect(closed!.quantity).toBe(60)
    expect(open!.quantity).toBe(40)
  })
})
