import Database from 'better-sqlite3-multiple-ciphers'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { SQL_001_INITIAL } from '@/lib/db/migrations/001_initial'
import { listTradesByAccount, replaceTradesForAccount, rowToTrade } from './tradesRepository'
import type { Trade } from '@/types'

function openTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(SQL_001_INITIAL)
  db.exec(`INSERT INTO accounts (id, name, broker, type, color, currency, starting_balance, risk_per_trade, daily_loss_limit, created_at)
    VALUES ('acc-1', 'Test', '', 'live', 'green', 'USD', 10000, 1, 0, '2026-01-01T00:00:00.000Z')`)
  return db
}

const sampleTrade = (): Trade => ({
  id: 'trade-1',
  symbol: 'ES',
  market: 'Futuros',
  direction: 'LONG',
  status: 'CLOSED',
  entryDate: '2026-01-02T00:00:00.000Z',
  exitDate: '2026-01-03T00:00:00.000Z',
  entryPrice: 5000,
  exitPrice: 5010,
  quantity: 1,
  multiplier: 50,
  fees: 4,
  strategy: 'Breakout',
  tags: ['test'],
  notes: 'ok',
  rating: 4,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T01:00:00.000Z',
})

describe('tradesRepository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('rowToTrade mapea fila SQLite → Trade', () => {
    replaceTradesForAccount(db, 'acc-1', [sampleTrade()])
    const rows = db.prepare('SELECT * FROM trades WHERE account_id = ?').all('acc-1') as Parameters<typeof rowToTrade>[0][]
    expect(rows).toHaveLength(1)
    const trade = rowToTrade(rows[0])
    expect(trade.symbol).toBe('ES')
    expect(trade.tags).toEqual(['test'])
  })

  it('replaceTradesForAccount sustituye operaciones de la cuenta', () => {
    replaceTradesForAccount(db, 'acc-1', [sampleTrade()])
    expect(listTradesByAccount(db, 'acc-1')).toHaveLength(1)
    replaceTradesForAccount(db, 'acc-1', [])
    expect(listTradesByAccount(db, 'acc-1')).toHaveLength(0)
  })
})
