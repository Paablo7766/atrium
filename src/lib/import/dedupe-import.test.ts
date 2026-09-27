import { describe, expect, it } from 'vitest'
import { dedupeTrades } from '@/lib/csv'
import type { Trade } from '@/types'
import { CSVImportEngine } from './engine'
import { mapConsolidatedTrades, toStoreTrades } from './tradeMapper'

const baseTrade = (over: Partial<Trade>): Trade => ({
  id: over.id ?? 't1',
  symbol: 'EURUSD',
  market: 'Forex',
  direction: 'LONG',
  status: 'CLOSED',
  entryDate: '2024-03-15T10:00:00.000Z',
  exitDate: '2024-03-16T11:00:00.000Z',
  entryPrice: 1.085,
  exitPrice: 1.09,
  quantity: 1,
  multiplier: 1,
  fees: 5,
  strategy: 'test',
  tags: [],
  notes: '',
  rating: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...over,
})

describe('dedupe after broker import', () => {
  it('omite reimport idéntico por fingerprint', () => {
    const csv = `Symbol;Type;Volume;Open Price;Open Time;Close Price;Close Time;Commission
EURUSD;buy;1,00;1,08500;15.03.2024 10:00:00;1,09000;16.03.2024 11:00:00;2,50
`
    const engine = new CSVImportEngine()
    const first = engine.importAndGroup(csv, 'XTB')
    const mapped = mapConsolidatedTrades(first.trades, { broker: 'XTB' })
    const store1 = toStoreTrades(mapped)
    const { trades: unique1 } = dedupeTrades(store1, [])
    expect(unique1.length).toBe(1)

    const store2 = toStoreTrades(mapConsolidatedTrades(engine.importAndGroup(csv, 'XTB').trades, { broker: 'XTB' }))
    const { trades: unique2, skipped } = dedupeTrades(store2, unique1)
    expect(unique2.length).toBe(0)
    expect(skipped).toBe(1)
  })

  it('respeta id estable desde externalId en ready trades', () => {
    const csv = [
      'Instrument,Ticker,Category,Type,Volume,Open Price,Open Time (UTC),Close Price,Close Time (UTC),Profit/Loss,Commission,Swap,Position ID',
      'X,AAPL.US,STOCK,BUY,1,100,2026-01-01T10:00:00.000Z,110,2026-01-02T10:00:00.000Z,10,0,0,999888777',
    ].join('\n')
    const { trades } = new CSVImportEngine().importAndGroup(csv, 'XTB')
    expect(trades[0].id).toMatch(/^imp-import-xtb:999888777/)
  })
})
