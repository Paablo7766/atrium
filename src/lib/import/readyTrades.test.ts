import { describe, expect, it } from 'vitest'
import { CSVImportEngine } from './engine'
import { xtbAdapter, interactiveBrokersAdapter, degiroAdapter, fomoAdapter, axiomAdapter } from './adapters'
import { assembleImportTrades, FIFO_FILL_ADAPTERS, READY_POSITION_ADAPTERS } from './readyTrades'

function xtbClosedCsv(rows: string[]): string {
  return [
    'Instrument,Ticker,Category,Type,Volume,Open Price,Open Time (UTC),Close Price,Close Time (UTC),Profit/Loss,Commission,Swap,Position ID',
    ...rows,
  ].join('\n')
}

function xtbOpenCsv(rows: string[]): string {
  return [
    'Product,Instrument/Position,Ticker,Category,Type,Volume,Current price,Open price,Open time (UTC),Net Profit',
    ...rows,
  ].join('\n')
}

describe('adapter output modes', () => {
  it('declara qué adaptadores entregan trades ya formados vs fills FIFO', () => {
    expect(xtbAdapter.outputMode).toBe('READY_POSITIONS')
    expect(READY_POSITION_ADAPTERS).toContain('XTB')
    for (const a of [interactiveBrokersAdapter, degiroAdapter, fomoAdapter, axiomAdapter]) {
      expect(a.outputMode).toBe('FIFO_FILLS')
      expect(FIFO_FILL_ADAPTERS).toContain(a.id)
    }
  })
})

describe('XTB Closed Positions → ready trades (no FIFO)', () => {
  it('trata cada fila como operación cerrada aunque compartan Position ID', () => {
    const csv = xtbClosedCsv([
      'Sivers,SIVE.SE,STOCK,BUY,51,53.45,2026-07-02T12:31:18.327Z,29.76,2026-08-28T05:25:48.204Z,-111.79,0,0,2672768717',
      'Sivers,SIVE.SE,STOCK,BUY,10,53.45,2026-07-02T12:31:18.327Z,29.82,2026-08-28T05:25:48.204Z,-21.86,0,0,2672768717',
    ])
    const { executions, readyTrades, trades } = new CSVImportEngine().importAndGroup(csv, 'XTB')
    expect(executions).toHaveLength(0)
    expect(readyTrades).toHaveLength(2)
    expect(trades).toHaveLength(2)
    expect(trades.every((t) => t.status === 'CLOSED')).toBe(true)
    const byQty = [...trades].sort((a, b) => b.quantityClosed - a.quantityClosed)
    expect(byQty[0]).toMatchObject({
      ticker: 'SIVE.SE',
      quantityClosed: 51,
      avgEntryPrice: 53.45,
      avgExitPrice: 29.76,
      netPnl: -111.79,
    })
    expect(byQty[1]).toMatchObject({
      ticker: 'SIVE.SE',
      quantityClosed: 10,
      avgExitPrice: 29.82,
      netPnl: -21.86,
    })
  })

  it('no fusiona filas del mismo ticker que se solapan en el tiempo', () => {
    const csv = xtbClosedCsv([
      'Sivers,SIVE.SE,STOCK,BUY,93,31.68,2026-09-09T06:06:08.402Z,29.3,2026-09-09T09:07:04.115Z,-22.45,0,0,2804787542',
      'Sivers,SIVE.SE,STOCK,BUY,20,26.84,2026-09-04T12:53:31.371Z,29.3,2026-09-09T09:07:04.115Z,3.72,0,0,2798276224',
      'Sivers,SIVE.SE,STOCK,BUY,21,26.22,2026-09-04T06:26:20.007Z,29.3,2026-09-09T09:07:04.115Z,4.99,0,0,2796963952',
    ])
    const { trades } = new CSVImportEngine().importAndGroup(csv, 'XTB')
    expect(trades).toHaveLength(3)
    expect(trades.map((t) => t.netPnl).sort()).toEqual([-22.45, 3.72, 4.99].sort())
  })

  it('usa Profit/Loss de la fila aunque no coincida con precio×qty', () => {
    const csv = xtbClosedCsv([
      'BITCOIN,BITCOIN,CFD,BUY,0.001,69993.5,2026-02-06T18:04:05.924Z,78505.6,2026-09-08T16:48:23.211Z,-5.19,0,0,2360734139',
    ])
    const { trades } = new CSVImportEngine().importAndGroup(csv, 'XTB')
    expect(trades).toHaveLength(1)
    expect(trades[0].netPnl).toBeCloseTo(-5.19, 6)
  })
})

describe('XTB Open Positions no entran al FIFO de las cerradas', () => {
  it('mantiene los cortos cerrados de DELL separados de los abiertos', () => {
    const closed = xtbClosedCsv([
      'Dell,DELL.US,CFD,SELL,1,557,2026-09-11T15:31:42.592Z,589.34,2026-09-17T13:09:43.110Z,-28.36,0,-0.06,2811654466',
      'Dell,DELL.US,CFD,SELL,1,566.77,2026-09-16T12:50:04.310Z,567.68,2026-09-16T15:53:24.295Z,-0.79,0,0,2819200899',
    ])
    const open = xtbOpenCsv([
      'My Trades,2824835210,DELL.US,CFD,SELL,1,590,584.76,2026-09-18T12:28:40.281Z,10',
      'My Trades,2822415751,DELL.US,CFD,SELL,1,590,578.85,2026-09-17T12:10:22.441Z,12',
    ])
    const { executions, readyTrades, trades } = new CSVImportEngine().importAndGroup([closed, open], 'XTB')
    expect(executions).toHaveLength(0)
    expect(readyTrades).toHaveLength(4)
    const closedTrades = trades.filter((t) => t.status === 'CLOSED' && t.ticker === 'DELL.US')
    const openTrades = trades.filter((t) => t.status === 'OPEN' && t.ticker === 'DELL.US')
    expect(closedTrades).toHaveLength(2)
    expect(openTrades).toHaveLength(2)
    expect(closedTrades.map((t) => t.netPnl).sort()).toEqual([-28.36, -0.79].sort())
    expect(closedTrades.map((t) => t.avgExitPrice).sort()).toEqual([567.68, 589.34].sort())
    expect(openTrades.every((t) => t.netPnl === null)).toBe(true)
    expect(openTrades.map((t) => t.avgEntryPrice).sort()).toEqual([578.85, 584.76].sort())
  })

  it('omite filas resumen de Open Positions sin Type', () => {
    const open = xtbOpenCsv(['My Trades,Dell,DELL.US,CFD,,2,581.81,581.81,,20'])
    const { trades } = new CSVImportEngine().importAndGroup(open, 'XTB')
    expect(trades).toHaveLength(0)
  })
})

describe('XTB historial de fills (sin columnas Close) → FIFO', () => {
  it('sigue agrupando buy/sell sueltos cuando el CSV no es Closed/Open Positions', () => {
    const csv = `Symbol;Type;Volume;Open Price;Open Time;Commission
EURUSD;buy;1,00;1,08500;15.03.2024 10:00:00;2,50
EURUSD;sell;1,00;1,09000;16.03.2024 11:00:00;2,50
`
    const { executions, readyTrades, trades } = new CSVImportEngine().importAndGroup(csv, 'XTB')
    expect(readyTrades).toHaveLength(0)
    expect(executions).toHaveLength(2)
    expect(trades).toHaveLength(1)
    expect(trades[0]).toMatchObject({ status: 'CLOSED', direction: 'LONG' })
    expect(trades[0].avgEntryPrice).toBeCloseTo(1.085, 9)
    expect(trades[0].avgExitPrice).toBeCloseTo(1.09, 9)
    expect(trades[0].netPnl).toBeCloseTo(-4.995, 5)
  })
})

describe('assembleImportTrades', () => {
  it('no mete ready trades en el libro FIFO de fills del mismo ticker', () => {
    const assembled = assembleImportTrades(
      [
        {
          broker: 'MANUAL',
          ticker: 'DELL.US',
          instrumentType: 'CFD',
          side: 'SELL',
          quantity: 1,
          price: 500,
          fees: 0,
          baseCurrency: 'USD',
          quoteCurrency: 'USD',
          multiplier: 1,
          executedAt: '2026-09-12T10:00:00.000Z',
        },
      ],
      [
        {
          provenance: 'BROKER_CLOSED_ROW',
          ticker: 'DELL.US',
          instrumentType: 'CFD',
          direction: 'SHORT',
          status: 'CLOSED',
          quantity: 0,
          quantityClosed: 1,
          avgEntryPrice: 557,
          avgExitPrice: 589.34,
          feesTotal: 0.06,
          netPnl: -28.36,
          baseCurrency: 'USD',
          quoteCurrency: 'USD',
          multiplier: 1,
          openedAt: '2026-09-11T15:31:42.592Z',
          closedAt: '2026-09-17T13:09:43.110Z',
        },
      ],
    )
    expect(assembled).toHaveLength(2)
    expect(assembled.filter((t) => t.status === 'CLOSED')).toHaveLength(1)
    expect(assembled.filter((t) => t.status === 'OPEN')).toHaveLength(1)
  })
})
