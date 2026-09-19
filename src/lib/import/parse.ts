/** Utilidades de parsing robustas para CSV multi-broker. */

const EMPTY = /^(?:\s*|n\/?a|null|nil|-|—|–)$/i

export function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true
  return EMPTY.test(String(v))
}

/**
 * Parsea números con separadores europeos/US.
 * "1.234,56" → 1234.56 | "1,234.56" → 1234.56 | "1 234,56" → 1234.56
 */
export function parseLocaleNumber(
  raw: string | number | null | undefined,
  preferredDecimal?: ',' | '.',
): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (raw === null || raw === undefined || isBlank(raw)) return null

  let s = String(raw).trim()
  const negParen = /^\(.*\)$/.test(s)
  if (negParen) s = s.slice(1, -1)

  s = s
    .replace(/[\s\u00a0']/g, '')
    .replace(/^[€$£¥]+/i, '')
    .replace(/(?:EUR|USD|GBP|CHF)$/i, '')

  if (!s || s === '-' || s === '+') return null

  let normalized: string
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  if (preferredDecimal === ',') {
    // Excel/SheetJS suele emitir decimales con punto aunque el bróker sea EU
    if (s.includes('.') && !s.includes(',')) {
      normalized = s
    } else {
      normalized = s.replace(/\./g, '').replace(',', '.')
    }
  } else if (preferredDecimal === '.') {
    normalized = s.replace(/,/g, '')
  } else if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    const [, dec = ''] = s.split(',')
    // Una coma + 1–2 decimales → decimal EU; si no, miles
    normalized = dec.length > 0 && dec.length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  } else {
    normalized = s
  }

  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return negParen ? -Math.abs(n) : n
}

/** Safe divide; null si divisor ~0. */
export function safeDiv(numerator: number, denominator: number, eps = 1e-12): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (Math.abs(denominator) < eps) return null
  return numerator / denominator
}

export function weightedAverage(
  currentAvg: number,
  currentQty: number,
  addPrice: number,
  addQty: number,
): number {
  const totalQty = currentQty + addQty
  if (totalQty <= 0 || !Number.isFinite(totalQty)) return currentAvg
  if (!Number.isFinite(currentAvg) || currentQty <= 0) return addPrice
  if (!Number.isFinite(addPrice) || addQty <= 0) return currentAvg
  return (currentAvg * currentQty + addPrice * addQty) / totalQty
}

/** Normaliza cabeceras CSV para matching. */
export function normalizeHeader(h: string): string {
  return h
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

export function pickField(row: Record<string, string>, aliases: string[]): string | undefined {
  const map = new Map<string, string>()
  for (const [k, v] of Object.entries(row)) {
    map.set(normalizeHeader(k), v)
  }
  for (const alias of aliases) {
    const v = map.get(normalizeHeader(alias))
    if (v !== undefined && !isBlank(v)) return v.trim()
  }
  return undefined
}

/**
 * Fechas multi-formato: ISO, DD/MM/YYYY, serial Excel, YYYY.MM.DD, con hora opcional.
 * `dayFirst` true → europeo (XTB/DEGIRO); false → US (IB a veces).
 */
export function parseBrokerDate(
  dateRaw: string | undefined,
  timeRaw?: string,
  opts: { dayFirst?: boolean } = {},
): string | null {
  if (!dateRaw || isBlank(dateRaw)) return null
  const dayFirst = opts.dayFirst !== false
  const datePart = dateRaw.trim()
  const timePart = (timeRaw ?? '').trim()

  // Serial Excel (p.ej. 45321.4167) — típico en XLSX de XTB sin formatear
  if (/^\d{5}(?:\.\d+)?$/.test(datePart)) {
    const serial = Number(datePart)
    const iso = excelSerialToIso(serial)
    if (iso) return iso
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(datePart)) {
    const withTime = datePart.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?/)
    if (withTime) {
      const time = withTime[2]
        ? normalizeTime(withTime[2])
        : timePart
          ? normalizeTime(timePart)
          : '12:00:00'
      const d = new Date(`${withTime[1]}T${time}`)
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
  }

  const m = datePart.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3])
    let day: number
    let month: number
    if (dayFirst) {
      day = a
      month = b
    } else if (a > 12) {
      day = a
      month = b
    } else {
      month = a
      day = b
    }
    const time = m[4] ? normalizeTime(m[4]) : timePart ? normalizeTime(timePart) : '12:00:00'
    const d = new Date(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${time}`)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  const y = datePart.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/)
  if (y) {
    const time = timePart ? normalizeTime(timePart) : '12:00:00'
    const d = new Date(`${y[1]}-${pad(+y[2], 2)}-${pad(+y[3], 2)}T${time}`)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  const fallback = new Date(timePart ? `${datePart} ${timePart}` : datePart)
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString()
}

/** Excel epoch (con bug del leap 1900): días desde 1899-12-30. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function normalizeTime(t: string): string {
  const parts = t.replace(',', '.').split(':').map((p) => p.trim())
  const h = pad(Number(parts[0]) || 0, 2)
  const m = pad(Number(parts[1]) || 0, 2)
  const s = pad(Number((parts[2] ?? '0').split('.')[0]) || 0, 2)
  return `${h}:${m}:${s}`
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0')
}

export function parseSide(raw: string | undefined): 'BUY' | 'SELL' | null {
  if (!raw || isBlank(raw)) return null
  const v = raw.trim().toUpperCase()
  if (v.includes('BUY') || v.includes('COMPRA') || v.includes('LONG') || v === 'B' || v === 'C') return 'BUY'
  if (v.includes('SELL') || v.includes('VENTA') || v.includes('SHORT') || v === 'S') return 'SELL'
  return null
}

export function inferInstrumentType(ticker: string, hint?: string): import('./types').InstrumentType {
  const h = (hint ?? '').toUpperCase()
  if (/CFD/.test(h)) return 'CFD'
  if (/FOREX|FX|CURRENCY/.test(h)) return 'FOREX'
  if (/FUT|FUTURE/.test(h)) return 'FUTURE'
  if (/OPT|OPTION/.test(h)) return 'OPTION'
  if (/CRYPTO|BTC|ETH/.test(h)) return 'CRYPTO'
  if (/STOCK|SHARE|EQUITY|ACCION|ETF/.test(h)) return 'STOCK'
  const compact = ticker.replace(/\W/g, '').toUpperCase()
  if (/^[A-Z]{6}$/.test(compact) && /USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD/.test(compact)) return 'FOREX'
  return 'OTHER'
}

export function splitFxPair(ticker: string): { base: string; quote: string } | null {
  const raw = ticker.trim().toUpperCase()
  // EUR/USD o EUR-USD
  const slash = raw.match(/^([A-Z]{3})[\/\-]([A-Z]{3})$/)
  if (slash) return { base: slash[1], quote: slash[2] }

  // No tratar acciones/CFD con punto (DELL.US, VUAA.DE) como FX
  if (raw.includes('.')) return null

  const clean = raw.replace(/[^A-Z]/g, '')
  if (clean.length !== 6) return null
  const base = clean.slice(0, 3)
  const quote = clean.slice(3, 6)
  const CC = /^(USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD|CNH|SEK|NOK|PLN|MXN|ZAR|HKD|SGD)$/
  if (CC.test(base) && CC.test(quote)) return { base, quote }
  return null
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
