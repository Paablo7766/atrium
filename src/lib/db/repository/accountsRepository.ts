import type Database from 'better-sqlite3-multiple-ciphers'
import {
  ACCOUNT_COLORS,
  ACCOUNT_TYPES,
  type AccountBook,
  type AccountColor,
  type AccountType,
  type Currency,
  type JournalEntry,
  type Trade,
  type Cashflow,
} from '@/types'
import { TABLES, type AccountRow } from '../schema'
import { listCashflowsByAccount } from './cashflowsRepository'
import { listJournalEntriesByAccount } from './journalEntriesRepository'
import { listTradesByAccount } from './tradesRepository'

function asAccountType(v: string): AccountType {
  return ACCOUNT_TYPES.some((t) => t.value === v) ? (v as AccountType) : 'live'
}

function asAccountColor(v: string): AccountColor {
  return ACCOUNT_COLORS.some((c) => c.value === v) ? (v as AccountColor) : 'green'
}

function asCurrency(v: string): Currency {
  return v === 'EUR' || v === 'GBP' ? v : 'USD'
}

export function rowToAccount(
  row: AccountRow,
  trades: Trade[],
  notes: JournalEntry[],
  cashflows: Cashflow[],
): AccountBook {
  return {
    id: row.id,
    name: row.name,
    broker: row.broker ?? '',
    type: asAccountType(row.type),
    color: asAccountColor(row.color),
    currency: asCurrency(row.currency),
    startingBalance: row.starting_balance,
    riskPerTrade: row.risk_per_trade,
    dailyLossLimit: row.daily_loss_limit,
    createdAt: row.created_at,
    trades,
    notes,
    cashflows,
  }
}

export function listAccounts(db: Database.Database): AccountBook[] {
  const rows = db.prepare(`SELECT * FROM ${TABLES.accounts} ORDER BY created_at ASC`).all() as AccountRow[]
  return rows.map((row) =>
    rowToAccount(
      row,
      listTradesByAccount(db, row.id),
      listJournalEntriesByAccount(db, row.id),
      listCashflowsByAccount(db, row.id),
    ),
  )
}

export function upsertAccount(db: Database.Database, account: AccountBook): void {
  db.prepare(`
    INSERT INTO ${TABLES.accounts} (
      id, name, broker, type, color, currency, starting_balance,
      risk_per_trade, daily_loss_limit, created_at
    ) VALUES (
      @id, @name, @broker, @type, @color, @currency, @starting_balance,
      @risk_per_trade, @daily_loss_limit, @created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      broker = excluded.broker,
      type = excluded.type,
      color = excluded.color,
      currency = excluded.currency,
      starting_balance = excluded.starting_balance,
      risk_per_trade = excluded.risk_per_trade,
      daily_loss_limit = excluded.daily_loss_limit
  `).run({
    id: account.id,
    name: account.name,
    broker: account.broker ?? '',
    type: account.type ?? 'live',
    color: account.color ?? 'green',
    currency: account.currency,
    starting_balance: account.startingBalance,
    risk_per_trade: account.riskPerTrade,
    daily_loss_limit: account.dailyLossLimit,
    created_at: account.createdAt,
  })
}

export function deleteAccountsNotIn(db: Database.Database, ids: Set<string>): void {
  const rows = db.prepare(`SELECT id FROM ${TABLES.accounts}`).all() as { id: string }[]
  const del = db.prepare(`DELETE FROM ${TABLES.accounts} WHERE id = ?`)
  for (const { id } of rows) {
    if (!ids.has(id)) del.run(id)
  }
}

export function isAccountsEmpty(db: Database.Database): boolean {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${TABLES.accounts}`).get() as { c: number }
  return row.c === 0
}
