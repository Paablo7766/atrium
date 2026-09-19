import type Database from 'better-sqlite3-multiple-ciphers'
import type { Cashflow, CashflowKind } from '@/types'
import { TABLES, type CashflowRow } from '../schema'

function asKind(v: string): CashflowKind {
  return v === 'withdrawal' ? 'withdrawal' : 'deposit'
}

export function rowToCashflow(row: CashflowRow): Cashflow {
  return {
    id: row.id,
    date: row.date,
    kind: asKind(row.kind),
    amount: row.amount,
    note: row.note ?? '',
  }
}

export function listCashflowsByAccount(db: Database.Database, accountId: string): Cashflow[] {
  const rows = db
    .prepare(`SELECT * FROM ${TABLES.cashflows} WHERE account_id = ? ORDER BY date DESC`)
    .all(accountId) as CashflowRow[]
  return rows.map(rowToCashflow)
}

export function replaceCashflowsForAccount(db: Database.Database, accountId: string, cashflows: Cashflow[]): void {
  db.prepare(`DELETE FROM ${TABLES.cashflows} WHERE account_id = ?`).run(accountId)
  const insert = db.prepare(`
    INSERT INTO ${TABLES.cashflows} (id, account_id, date, kind, amount, note)
    VALUES (@id, @account_id, @date, @kind, @amount, @note)
  `)
  for (const c of cashflows) {
    insert.run({
      id: c.id,
      account_id: accountId,
      date: c.date,
      kind: c.kind,
      amount: c.amount,
      note: c.note ?? '',
    })
  }
}
