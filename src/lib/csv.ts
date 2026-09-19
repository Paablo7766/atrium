import type { Trade, Market, Emotion } from '@/types'
import { EMOTIONS, MARKETS, parseDirection } from '@/types'
import { tradePnl, tradeR } from './stats'
import { toDateKey, toLocalInputValue, uid } from './format'

const esc = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function tradesToCsv(trades: Trade[]): string {
  const header = [
    'id',
    'symbol',
    'market',
    'direction',
    'status',
    'entryDate',
    'exitDate',
    'entryPrice',
    'exitPrice',
    'quantity',
    'multiplier',
    'fees',
    'stopLoss',
    'takeProfit',
    'pnl',
    'r',
    'strategy',
    'tags',
    'rating',
    'emotion',
    'notes',
    'setupId',
    'mistakes',
    'pnlOverride',
  ]
  const lines = trades.map((t) =>
    [
      t.id,
      t.symbol,
      t.market,
      t.direction,
      t.status,
      t.entryDate,
      t.exitDate ?? '',
      t.entryPrice,
      t.exitPrice ?? '',
      t.quantity,
      t.multiplier,
      t.fees,
      t.stopLoss ?? '',
      t.takeProfit ?? '',
      t.status === 'CLOSED' ? tradePnl(t).toFixed(2) : '',
      tradeR(t)?.toFixed(3) ?? '',
      t.strategy,
      t.tags.join('|'),
      t.rating,
      t.emotion ?? '',
      t.notes,
      t.setupId ?? '',
      (t.mistakes ?? []).join('|'),
      t.pnlOverride ?? '',
    ]
      .map(esc)
      .join(','),
  )
  return '\ufeff' + [header.join(','), ...lines].join('\r\n')
}

// Parser CSV sencillo con soporte de comillas
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false
  const src = text.replace(/^\ufeff/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',' || c === ';') {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cur)
      cur = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  row.push(cur)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

const num = (v: string | undefined) => {
  if (v === undefined || v.trim() === '') return undefined
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

const toIso = (v: string | undefined) => {
  if (!v) return undefined
  const trimmed = v.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T12:00:00`)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Same symbol, side, timestamps to the minute, prices and size — used to skip re-imports. */
export function tradeFingerprint(t: {
  symbol: string
  direction: string
  status: string
  entryDate: string
  exitDate?: string
  entryPrice: number
  exitPrice?: number
  quantity: number
}): string {
  const money = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '' : n.toFixed(6))
  const when = (iso: string | undefined) => {
    if (!iso) return ''
    const local = toLocalInputValue(iso)
    return local ? local.slice(0, 16) : toDateKey(iso)
  }
  return [
    t.symbol.trim().toUpperCase(),
    t.direction,
    t.status,
    when(t.entryDate),
    money(t.entryPrice),
    money(t.quantity),
    when(t.exitDate),
    money(t.exitPrice),
  ].join('|')
}

export function dedupeTrades(incoming: Trade[], existing: Trade[] = []): { trades: Trade[]; skipped: number } {
  const ids = new Set(existing.map((t) => t.id))
  const prints = new Set(existing.map(tradeFingerprint))
  const trades: Trade[] = []
  let skipped = 0
  for (const t of incoming) {
    const fp = tradeFingerprint(t)
    if (ids.has(t.id) || prints.has(fp)) {
      skipped += 1
      continue
    }
    ids.add(t.id)
    prints.add(fp)
    trades.push(t)
  }
  return { trades, skipped }
}

export function csvToTrades(text: string): { trades: Trade[]; errors: string[]; skippedDuplicates: number } {
  const rows = parseCsv(text)
  if (rows.length < 2) return { trades: [], errors: ['El archivo no contiene filas de datos.'], skippedDuplicates: 0 }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const COLS: Record<string, string[]> = {
    id: ['id'],
    symbol: ['symbol', 'símbolo', 'simbolo', 'ticker', 'instrumento'],
    market: ['market', 'mercado'],
    direction: ['direction', 'dirección', 'direccion', 'side', 'sentido'],
    status: ['status', 'estado'],
    entrydate: ['entrydate', 'entry_date', 'fechaentrada', 'fecha_entrada', 'fecha'],
    exitdate: ['exitdate', 'exit_date', 'fechasalida', 'fecha_salida'],
    entryprice: ['entryprice', 'entry_price', 'precioentrada', 'precio_entrada'],
    exitprice: ['exitprice', 'exit_price', 'preciosalida', 'precio_salida'],
    quantity: ['quantity', 'qty', 'cantidad', 'size', 'tamaño', 'tamano', 'lots', 'lotes'],
    multiplier: ['multiplier', 'multiplicador', 'contrato', 'pointvalue'],
    fees: ['fees', 'comisiones', 'commission', 'comisión', 'comision'],
    stoploss: ['stoploss', 'stop_loss', 'stop', 'sl'],
    takeprofit: ['takeprofit', 'take_profit', 'tp', 'objetivo'],
    pnl: ['pnl', 'p&l', 'resultado', 'profit', 'netpnl'],
    strategy: ['strategy', 'estrategia'],
    tags: ['tags', 'etiquetas', 'tag'],
    rating: ['rating', 'calidad', 'stars'],
    emotion: ['emotion', 'emoción', 'emocion'],
    notes: ['notes', 'notas', 'note', 'comentario'],
    setupid: ['setupid', 'setup', 'playbook'],
    mistakes: ['mistakes', 'errores', 'error'],
    pnloverride: ['pnloverride', 'pnl_override', 'manualpnl'],
  }
  const idx = (name: string) => {
    const aliases = COLS[name.toLowerCase()] ?? [name.toLowerCase()]
    return header.findIndex((h) => aliases.includes(h.replace(/[\s_]+/g, '')))
  }
  const get = (r: string[], name: string) => {
    const i = idx(name)
    return i >= 0 ? r[i] : undefined
  }
  const trades: Trade[] = []
  const errors: string[] = []
  const now = new Date().toISOString()

  rows.slice(1).forEach((r, i) => {
    const symbol = get(r, 'symbol')?.trim().toUpperCase()
    const entryDate = toIso(get(r, 'entryDate'))
    const entryPrice = num(get(r, 'entryPrice'))
    const quantity = num(get(r, 'quantity'))
    if (!symbol || !entryDate || entryPrice === undefined || quantity === undefined) {
      errors.push(`Fila ${i + 2}: faltan símbolo, fecha, precio de entrada o cantidad.`)
      return
    }
    const direction = parseDirection(get(r, 'direction'))
    const marketRaw = get(r, 'market') ?? 'Otros'
    const market = (MARKETS.find((m) => m.toLowerCase() === marketRaw.toLowerCase()) ?? 'Otros') as Market
    const exitPrice = num(get(r, 'exitPrice'))
    const pnlCol = num(get(r, 'pnl'))
    const statusRaw = (get(r, 'status') ?? '').toUpperCase()
    const status = statusRaw === 'OPEN' || (exitPrice === undefined && pnlCol === undefined && statusRaw !== 'CLOSED') ? 'OPEN' : 'CLOSED'
    const tagsRaw = get(r, 'tags') ?? ''

    const trade: Trade = {
      id: get(r, 'id')?.trim() || uid(),
      symbol,
      market,
      direction,
      status,
      entryDate,
      exitDate: toIso(get(r, 'exitDate')) ?? (status === 'CLOSED' ? entryDate : undefined),
      entryPrice,
      exitPrice,
      quantity,
      multiplier: num(get(r, 'multiplier')) ?? 1,
      fees: num(get(r, 'fees')) ?? 0,
      stopLoss: num(get(r, 'stopLoss')),
      takeProfit: num(get(r, 'takeProfit')),
      strategy: get(r, 'strategy')?.trim() ?? '',
      tags: tagsRaw
        .split(/[|;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      notes: get(r, 'notes') ?? '',
      rating: Math.min(5, Math.max(0, Math.round(num(get(r, 'rating')) ?? 0))),
      emotion: (EMOTIONS as readonly string[]).includes(get(r, 'emotion') ?? '') ? (get(r, 'emotion') as Emotion) : undefined,
      createdAt: now,
      updatedAt: now,
    }

    const setupId = get(r, 'setupId')?.trim()
    if (setupId) trade.setupId = setupId
    const mistakesRaw = get(r, 'mistakes') ?? ''
    if (mistakesRaw.trim()) {
      trade.mistakes = mistakesRaw
        .split(/[|;]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }

    const overrideCol = num(get(r, 'pnlOverride'))
    const calc = tradePnl({ ...trade, pnlOverride: undefined })
    const pnlDiffers = pnlCol !== undefined && Math.abs(calc - pnlCol) > 0.009
    trades.push({
      ...trade,
      pnlOverride:
        status === 'CLOSED' && overrideCol !== undefined
          ? overrideCol
          : status === 'CLOSED' && pnlCol !== undefined && (exitPrice === undefined || pnlDiffers)
            ? pnlCol
            : undefined,
    })
  })
  const unique = dedupeTrades(trades)
  return { trades: unique.trades, errors, skippedDuplicates: unique.skipped }
}
