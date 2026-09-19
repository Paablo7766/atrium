/**
 * Shared security helpers for Vercel Edge API routes.
 */

export const MAX_SYMBOLS = 40
export const MAX_SYMBOL_LEN = 24

export function cleanSymbol(raw: string): string {
  let t = raw.trim().toUpperCase()
  if (!t) return ''
  t = t.replace(/^[#$]+/, '')
  t = t.replace(
    /\.(US|UK|FR|DE|ES|IT|NL|BE|PT|PL|CH|AU|CA|JP|HK|CN|SE|NO|DK|FI|AT|IE|MX|BR|IN|KR|TW|SG|NZ|ZA|EU|CZ|HU|RO|GR|TR|LSE|NYSE|NASDAQ)$/i,
    '',
  )
  t = t.replace(/[._-](CFD|CASH|SPOT|IDX|INDEX)$/i, '')
  t = t.replace(/(CFD|CASH|SPOT)$/i, '')
  t = t.replace(/[.\-_]+$/g, '')
  if (t.length > MAX_SYMBOL_LEN) return ''
  if (!/^[A-Z0-9][A-Z0-9.\-_/=]*$/.test(t)) return ''
  return t
}

export function cleanSymbolsCsv(raw: string): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',')) {
    const s = cleanSymbol(part)
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= MAX_SYMBOLS) break
  }
  return out.join(',')
}

export function fmpKey(): string | undefined {
  return (process.env.FMP_API_KEY || process.env.VITE_FMP_API_KEY)?.trim() || undefined
}

/** CORS: restrict to ALLOWED_ORIGINS when set; otherwise same-origin friendly wildcard. */
export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  const origin = req.headers.get('Origin')
  const base: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  }
  if (allowed.length === 0) {
    return { ...base, 'Access-Control-Allow-Origin': '*' }
  }
  if (origin && allowed.includes(origin)) {
    return { ...base, 'Access-Control-Allow-Origin': origin }
  }
  // No Origin (same-origin / server-to-server) — omit ACAO
  if (!origin) return base
  return base
}
