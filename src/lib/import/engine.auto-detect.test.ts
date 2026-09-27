import { describe, expect, it } from 'vitest'
import { detectBroker, interactiveBrokersAdapter, scoreBrokerMatch, xtbAdapter } from './adapters'

describe('AUTO broker scoring', () => {
  it('prefiere IB cuando hay columnas exclusivas IB', () => {
    const ibHeaders = ['Symbol', 'Quantity', 'T. Price', 'Date/Time', 'IBCommission', 'Asset Category', 'TradeID']
    expect(scoreBrokerMatch(interactiveBrokersAdapter, ibHeaders)).toBeGreaterThan(scoreBrokerMatch(xtbAdapter, ibHeaders))
    expect(detectBroker(ibHeaders)?.id).toBe('INTERACTIVE_BROKERS')
  })

  it('no confunde plantillas de diario genérico con XTB', () => {
    const journal = ['Trade #', 'Entry date', 'Ticker', 'Quantity', 'Price', 'Exit date', 'Exit $$']
    expect(detectBroker(journal)?.id).not.toBe('XTB')
  })

  it('detecta XTB en Closed Positions', () => {
    const xtbHeaders = [
      'Symbol',
      'Type',
      'Volume',
      'Open Time (UTC)',
      'Close Time (UTC)',
      'Open Price',
      'Close Price',
      'Profit/Loss',
      'Position ID',
    ]
    expect(detectBroker(xtbHeaders)?.id).toBe('XTB')
  })
})
