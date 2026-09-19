import type Database from 'better-sqlite3-multiple-ciphers'
import { EMOTIONS, MARKETS, parseDirection, type Emotion, type Market, type Trade, type TradeStatus } from '@/types'
import { TABLES, type TradeRow } from '../schema'

function parseJsonStrings(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined
  } catch {
    return undefined
  }
}

function asMarket(v: string): Market {
  return MARKETS.includes(v as Market) ? (v as Market) : 'Otros'
}

function asEmotion(v: string | null): Emotion | undefined {
  return v && EMOTIONS.includes(v as Emotion) ? (v as Emotion) : undefined
}

function asStatus(v: string): TradeStatus {
  return v === 'OPEN' ? 'OPEN' : 'CLOSED'
}

export function rowToTrade(row: TradeRow): Trade {
  const trade: Trade = {
    id: row.id,
    symbol: row.symbol,
    market: asMarket(row.market),
    direction: parseDirection(row.direction),
    status: asStatus(row.status),
    entryDate: row.entry_date,
    entryPrice: row.entry_price,
    quantity: row.quantity,
    multiplier: row.multiplier || 1,
    fees: row.fees,
    strategy: row.strategy ?? '',
    tags: parseJsonStrings(row.tags) ?? [],
    notes: row.notes ?? '',
    rating: row.rating ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (row.exit_date) trade.exitDate = row.exit_date
  if (row.exit_price != null) trade.exitPrice = row.exit_price
  if (row.stop_loss != null) trade.stopLoss = row.stop_loss
  if (row.take_profit != null) trade.takeProfit = row.take_profit
  const emotion = asEmotion(row.emotion)
  if (emotion) trade.emotion = emotion
  if (row.pnl_override != null) trade.pnlOverride = row.pnl_override
  if (row.setup_id) trade.setupId = row.setup_id
  const checklist = parseJsonStrings(row.checklist_done)
  if (checklist?.length) trade.checklistDone = checklist
  const mistakes = parseJsonStrings(row.mistakes)
  if (mistakes?.length) trade.mistakes = mistakes
  return trade
}

export function listTradesByAccount(db: Database.Database, accountId: string): Trade[] {
  const rows = db
    .prepare(`SELECT * FROM ${TABLES.trades} WHERE account_id = ? ORDER BY entry_date DESC`)
    .all(accountId) as TradeRow[]
  return rows.map(rowToTrade)
}

export function replaceTradesForAccount(db: Database.Database, accountId: string, trades: Trade[]): void {
  db.prepare(`DELETE FROM ${TABLES.trades} WHERE account_id = ?`).run(accountId)
  const insert = db.prepare(`
    INSERT INTO ${TABLES.trades} (
      id, account_id, symbol, market, direction, status, entry_date, exit_date,
      entry_price, exit_price, quantity, multiplier, fees, stop_loss, take_profit,
      strategy, tags, notes, rating, emotion, pnl_override, setup_id,
      checklist_done, mistakes, created_at, updated_at
    ) VALUES (
      @id, @account_id, @symbol, @market, @direction, @status, @entry_date, @exit_date,
      @entry_price, @exit_price, @quantity, @multiplier, @fees, @stop_loss, @take_profit,
      @strategy, @tags, @notes, @rating, @emotion, @pnl_override, @setup_id,
      @checklist_done, @mistakes, @created_at, @updated_at
    )
  `)
  for (const t of trades) {
    insert.run({
      id: t.id,
      account_id: accountId,
      symbol: t.symbol,
      market: t.market,
      direction: t.direction,
      status: t.status,
      entry_date: t.entryDate,
      exit_date: t.exitDate ?? null,
      entry_price: t.entryPrice,
      exit_price: t.exitPrice ?? null,
      quantity: t.quantity,
      multiplier: t.multiplier || 1,
      fees: t.fees,
      stop_loss: t.stopLoss ?? null,
      take_profit: t.takeProfit ?? null,
      strategy: t.strategy ?? '',
      tags: JSON.stringify(t.tags ?? []),
      notes: t.notes ?? '',
      rating: t.rating ?? 0,
      emotion: t.emotion ?? null,
      pnl_override: t.pnlOverride ?? null,
      setup_id: t.setupId ?? null,
      checklist_done: t.checklistDone?.length ? JSON.stringify(t.checklistDone) : null,
      mistakes: t.mistakes?.length ? JSON.stringify(t.mistakes) : null,
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    })
  }
}
