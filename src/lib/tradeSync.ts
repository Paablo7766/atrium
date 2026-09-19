import type { Trade } from '@/types'
import type { BrokerId, ConsolidatedTrade, InstrumentType, NormalizedExecution } from '@/lib/import/types'
import { marketFromInstrument } from '@/lib/import/tradeMapper'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Fila de `public.trades` (snake_case Supabase). */
export interface DbTradeRow {
  id: string
  account_id: string
  user_id: string
  ticker: string
  instrument_type: InstrumentType
  direction: 'LONG' | 'SHORT'
  status: 'OPEN' | 'CLOSED'
  quantity: number | string
  quantity_closed: number | string
  avg_entry_price: number | string
  avg_exit_price: number | string | null
  fees_total: number | string
  net_pnl: number | string | null
  base_currency: string
  quote_currency: string
  multiplier: number | string
  opened_at: string
  closed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DbExecutionInsert {
  id?: string
  account_id: string
  user_id: string
  trade_id?: string | null
  import_batch_id?: string | null
  broker: BrokerId
  external_id?: string | null
  ticker: string
  instrument_type: InstrumentType
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  fees: number
  base_currency: string
  quote_currency: string
  multiplier: number
  executed_at: string
  raw_row?: Record<string, string> | null
}

function num(v: number | string | null | undefined, fallback = 0): number {
  if (v == null) return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Mapea una fila Supabase → Trade del Dashboard / store. */
export function dbTradeToUiTrade(row: DbTradeRow): Trade {
  const qtyOpen = num(row.quantity)
  const qtyClosed = num(row.quantity_closed)
  const quantity = row.status === 'CLOSED' ? Math.max(qtyClosed, qtyOpen, 0) || 1 : Math.max(qtyOpen, 0) || 1
  const netPnl = row.net_pnl != null ? num(row.net_pnl) : undefined

  return {
    id: row.id,
    symbol: row.ticker.toUpperCase(),
    market: marketFromInstrument(row.instrument_type, row.ticker),
    direction: row.direction === 'SHORT' ? 'SHORT' : 'LONG',
    status: row.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    entryDate: row.opened_at,
    exitDate: row.closed_at ?? undefined,
    entryPrice: num(row.avg_entry_price),
    exitPrice: row.avg_exit_price != null ? num(row.avg_exit_price) : undefined,
    quantity,
    multiplier: num(row.multiplier, 1) || 1,
    fees: Math.abs(num(row.fees_total)),
    strategy: 'Cloud',
    tags: ['supabase'],
    notes: row.notes ?? '',
    rating: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(netPnl !== undefined && Number.isFinite(netPnl) ? { pnlOverride: netPnl } : {}),
  }
}

export async function fetchUserTrades(userId: string): Promise<Trade[]> {
  if (!isSupabaseConfigured()) return []

  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('opened_at', { ascending: false })

  if (error) throw new Error(error.message)
  return ((data ?? []) as DbTradeRow[]).map(dbTradeToUiTrade)
}

/**
 * Garantiza una cuenta cloud para el usuario (necesaria por FK de trades/executions).
 * Devuelve el `account_id`.
 */
export async function ensureCloudAccount(opts: {
  userId: string
  name: string
  currency: string
  broker?: BrokerId | string
}): Promise<string> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no está configurado.')

  const broker = (opts.broker ?? 'OTHER') as BrokerId
  const currency = (opts.currency || 'EUR').slice(0, 3).toUpperCase()

  const { data: existing, error: selErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', opts.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (selErr) throw new Error(selErr.message)
  if (existing?.id) return existing.id as string

  const { data: created, error: insErr } = await supabase
    .from('accounts')
    .insert({
      user_id: opts.userId,
      name: opts.name || 'Cuenta principal',
      broker,
      currency,
    })
    .select('id')
    .single()

  if (insErr) throw new Error(insErr.message)
  return created.id as string
}

function consolidatedToDbRow(
  ct: ConsolidatedTrade,
  accountId: string,
  userId: string,
): Record<string, unknown> {
  return {
    id: ct.id,
    account_id: accountId,
    user_id: userId,
    ticker: ct.ticker.toUpperCase(),
    instrument_type: ct.instrumentType,
    direction: ct.direction,
    status: ct.status,
    quantity: ct.quantity,
    quantity_closed: ct.quantityClosed,
    avg_entry_price: ct.avgEntryPrice,
    avg_exit_price: ct.avgExitPrice,
    fees_total: ct.feesTotal,
    net_pnl: ct.netPnl,
    base_currency: (ct.baseCurrency || 'USD').slice(0, 3).toUpperCase(),
    quote_currency: (ct.quoteCurrency || 'USD').slice(0, 3).toUpperCase(),
    multiplier: ct.multiplier || 1,
    opened_at: ct.openedAt,
    closed_at: ct.closedAt,
    notes: null,
  }
}

function executionToDbRow(
  ex: NormalizedExecution,
  accountId: string,
  userId: string,
  tradeId: string | null,
  batchId: string | null,
): DbExecutionInsert {
  return {
    account_id: accountId,
    user_id: userId,
    trade_id: tradeId,
    import_batch_id: batchId,
    broker: ex.broker,
    external_id: ex.externalId ?? null,
    ticker: ex.ticker.toUpperCase(),
    instrument_type: ex.instrumentType,
    side: ex.side,
    quantity: ex.quantity,
    price: ex.price,
    fees: ex.fees,
    base_currency: (ex.baseCurrency || 'USD').slice(0, 3).toUpperCase(),
    quote_currency: (ex.quoteCurrency || 'USD').slice(0, 3).toUpperCase(),
    multiplier: ex.multiplier || 1,
    executed_at: ex.executedAt,
    raw_row: ex.raw ?? null,
  }
}

export type SyncImportPayload = {
  userId: string
  accountName: string
  currency: string
  broker: BrokerId
  fileName?: string
  executions: NormalizedExecution[]
  consolidated: ConsolidatedTrade[]
}

export type SyncImportResult = {
  accountId: string
  batchId: string | null
  tradesUpserted: number
  executionsUpserted: number
}

/**
 * Persiste un import en Supabase:
 * 1) asegura cuenta
 * 2) crea import_batch
 * 3) upsert trades consolidados (vinculados a user_id)
 * 4) upsert executions (dedupe por account_id + broker + external_id)
 */
export async function syncImportToSupabase(payload: SyncImportPayload): Promise<SyncImportResult> {
  if (!isSupabaseConfigured()) {
    return { accountId: '', batchId: null, tradesUpserted: 0, executionsUpserted: 0 }
  }

  const accountId = await ensureCloudAccount({
    userId: payload.userId,
    name: payload.accountName,
    currency: payload.currency,
    broker: payload.broker,
  })

  let batchId: string | null = null
  const { data: batch, error: batchErr } = await supabase
    .from('import_batches')
    .insert({
      account_id: accountId,
      broker: payload.broker,
      file_name: payload.fileName ?? null,
      row_count: payload.executions.length,
    })
    .select('id')
    .single()

  if (batchErr) {
    // No bloquear el sync de trades si el batch falla
    console.warn('[tradeSync] import_batch:', batchErr.message)
  } else {
    batchId = batch.id as string
  }

  const tradeRows = payload.consolidated.map((ct) => consolidatedToDbRow(ct, accountId, payload.userId))
  if (tradeRows.length) {
    const { error } = await supabase.from('trades').upsert(tradeRows, { onConflict: 'id' })
    if (error) throw new Error(`trades upsert: ${error.message}`)
  }

  // Relacionar executions → trade por executionKeys del agrupador FIFO
  const keyToTradeId = new Map<string, string>()
  for (const ct of payload.consolidated) {
    for (const key of ct.executionKeys) keyToTradeId.set(key, ct.id)
  }

  const execRows = payload.executions.map((ex, idx) => {
    const key =
      ex.externalId?.trim() ||
      `${ex.ticker}|${ex.executedAt}|${ex.side}|${ex.quantity}|${ex.price}|${idx}`
    const tradeId = keyToTradeId.get(key) ?? null
    return executionToDbRow(ex, accountId, payload.userId, tradeId, batchId)
  })

  // Solo upsert con external_id (unique constraint); sin id externo → insert simple
  const withExternal = execRows.filter((r) => r.external_id)
  const withoutExternal = execRows.filter((r) => !r.external_id)

  if (withExternal.length) {
    const { error } = await supabase
      .from('executions')
      .upsert(withExternal, { onConflict: 'account_id,broker,external_id', ignoreDuplicates: false })
    if (error) throw new Error(`executions upsert: ${error.message}`)
  }
  if (withoutExternal.length) {
    const { error } = await supabase.from('executions').insert(withoutExternal)
    if (error) throw new Error(`executions insert: ${error.message}`)
  }

  return {
    accountId,
    batchId,
    tradesUpserted: tradeRows.length,
    executionsUpserted: execRows.length,
  }
}
