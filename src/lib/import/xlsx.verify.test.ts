import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { CSVImportEngine } from './engine'
import { parseBrokerDate, parseLocaleNumber } from './parse'
import { workbookArrayBufferToCsvParts } from './spreadsheet'

describe('xlsx import (verify script parity)', () => {
  it('ignora cash y parsea Closed Positions con metadatos', () => {
    expect(parseBrokerDate('45397.4166666667')).not.toBeNull()
    expect(parseLocaleNumber('1.085', ',')).toBe(1.085)
    expect(parseLocaleNumber('1,085', ',')).toBe(1.085)

    const cash = XLSX.utils.aoa_to_sheet([
      ['CASH OPERATION HISTORY'],
      ['ID', 'Type', 'Amount', 'Time'],
      ['1', 'deposit', '1000', 45397.5],
    ])

    const closed = XLSX.utils.aoa_to_sheet([
      ['CLOSED POSITION HISTORY'],
      ['Account:', '123456'],
      [],
      [
        'Position',
        'Symbol',
        'Type',
        'Volume',
        'Open time',
        'Open price',
        'Close time',
        'Close price',
        'Commission',
        'Swap',
        'Gross P/L',
      ],
      [1001, 'EURUSD', 'buy', 1.0, 45397.4167, 1.085, 45398.5, 1.09, -2.5, 0, 500],
      [1002, 'US100', 'sell', 0.5, 45400.2, 19500.5, 45401.1, 19400.0, -1.2, -0.3, 50.25],
    ])

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, cash, 'CASH OPERATION HISTORY')
    XLSX.utils.book_append_sheet(wb, closed, 'CLOSED POSITION HISTORY')

    const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const buffer =
      raw instanceof ArrayBuffer
        ? raw
        : raw instanceof Uint8Array
          ? (raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer)
          : Uint8Array.from(raw as number[]).buffer

    const parts = workbookArrayBufferToCsvParts(buffer)
    expect(parts.length).toBe(1)

    const { executions, readyTrades, trades } = new CSVImportEngine().importAndGroup(parts, 'XTB')
    expect(executions.length).toBe(0)
    expect(readyTrades.length).toBe(2)
    expect(trades.length).toBe(2)
    expect(trades.every((t) => t.status === 'CLOSED')).toBe(true)
    const eurusd = trades.find((t) => t.ticker === 'EURUSD')
    expect(eurusd?.netPnl).toBeCloseTo(500, 4)
  })
})
