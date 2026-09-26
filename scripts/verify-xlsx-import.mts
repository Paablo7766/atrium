/**
 * Reproduce el XLSX real de XTB: 2 hojas, metadatos encima, fechas serial/Excel.
 * Run: npx --yes tsx scripts/verify-xlsx-import.mts
 */
import * as XLSX from 'xlsx'
import { workbookArrayBufferToCsvParts } from '../src/lib/import/spreadsheet.ts'
import { CSVImportEngine } from '../src/lib/import/engine.ts'
import { parseBrokerDate, parseLocaleNumber } from '../src/lib/import/parse.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

assert(parseBrokerDate('45397.4166666667') != null, 'excel serial date')
assert(parseLocaleNumber('1.085', ',') === 1.085, 'excel decimal with EU preference')
assert(parseLocaleNumber('1,085', ',') === 1.085, 'EU decimal')

// --- Sheet 1: cash (debe ignorarse) ---
const cash = XLSX.utils.aoa_to_sheet([
  ['CASH OPERATION HISTORY'],
  ['ID', 'Type', 'Amount', 'Time'],
  ['1', 'deposit', '1000', 45397.5],
])

// --- Sheet 2: closed positions con metadatos (formato xStation) ---
const closed = XLSX.utils.aoa_to_sheet([
  ['CLOSED POSITION HISTORY'],
  ['Account:', '123456'],
  ['From:', '2024-01-01', 'To:', '2024-12-31'],
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
    'Comment',
  ],
  [1001, 'EURUSD', 'buy', 1.0, 45397.4167, 1.085, 45398.5, 1.09, -2.5, 0, 500, ''],
  [1002, 'US100', 'sell', 0.5, 45400.2, 19500.5, 45401.1, 19400.0, -1.2, -0.3, 50.25, ''],
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
assert(parts.length === 1, `expected 1 trade sheet (cash ignored), got ${parts.length}`)
const csv = parts[0]
assert(/CLOSED POSITION|Symbol/i.test(csv), 'picked closed sheet / has Symbol')
assert(!/^ID,Type,Amount/m.test(csv.split('\n')[0] ?? ''), 'not cash header as first data')

const { executions, readyTrades, trades, errors, warnings } = new CSVImportEngine().importAndGroup(parts, 'XTB')
assert(executions.length === 0, `Closed Positions no deben emitir fills FIFO, got ${executions.length}. errors=${errors.join('; ')} csv=\n${csv}`)
assert(readyTrades.length === 2, `2 ready trades got ${readyTrades.length}`)
assert(trades.length === 2, `2 trades got ${trades.length}`)
assert(trades.every((t) => t.status === 'CLOSED'), 'all closed')
const eurusd = trades.find((t) => t.ticker === 'EURUSD')
assert(eurusd && Math.abs((eurusd.netPnl ?? 0) - 500) < 1e-6, `EURUSD uses Gross P/L 500 got ${eurusd?.netPnl}`)

console.log('verify-xlsx-import: OK', {
  executions: executions.length,
  trades: trades.length,
  warnings,
  sample: trades.map((t) => ({ ticker: t.ticker, pnl: t.netPnl, dir: t.direction })),
})
