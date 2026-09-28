/**
 * Shared security helpers for Vercel Edge API routes.
 */

export const MAX_SYMBOLS = 40
export const MAX_SYMBOL_LEN = 24

/** img-src allowlist for logo CDNs (not proxied through /api/logo). */
export const CSP_IMG_SRC =
  "img-src 'self' data: blob: https://financialmodelingprep.com https://images.fmp.com https://cdn.jsdelivr.net https://assets.parqet.com"

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

/** Server-only. Prefer `FMP_API_KEY` on Vercel; `VITE_FMP_API_KEY` is a Vite-dev fallback. Never bundle this into the client. */
export function fmpKey(): string | undefined {
  return (process.env.FMP_API_KEY || process.env.VITE_FMP_API_KEY)?.trim() || undefined
}

function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/$/, '')
}

function hostToHttpsOrigin(host: string): string {
  const trimmed = host.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  return trimmed ? `https://${trimmed}` : ''
}

/**
 * Allowed browser origins for FMP/feedback API routes.
 * Set `ALLOWED_ORIGINS` (comma-separated) on Vercel; on Vercel without it, defaults to this deployment host.
 */
export function getAllowedOrigins(): string[] {
  const explicit = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)
  if (explicit.length > 0) return explicit

  if (process.env.VERCEL === '1') {
    const out = new Set<string>()
    const vercelUrl = process.env.VERCEL_URL?.trim()
    if (vercelUrl) {
      const origin = hostToHttpsOrigin(vercelUrl)
      if (origin) out.add(origin)
    }
    const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    if (production) {
      const origin = hostToHttpsOrigin(production)
      if (origin) out.add(origin)
    }
    return [...out]
  }

  return []
}

function corsBase(options?: { methods?: string }): Record<string, string> {
  return {
    'Access-Control-Allow-Methods': options?.methods ?? 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
  }
}

/** CORS headers only (legacy). Prefer `enforceRequestOrigin` on API routes. */
export function corsHeaders(req: Request, options?: { methods?: string }): Record<string, string> {
  const allowed = getAllowedOrigins()
  const origin = req.headers.get('Origin')
  const base = corsBase(options)
  if (allowed.length === 0) {
    return { ...base, 'Access-Control-Allow-Origin': '*' }
  }
  if (origin && allowed.includes(normalizeOrigin(origin))) {
    return { ...base, 'Access-Control-Allow-Origin': normalizeOrigin(origin) }
  }
  if (!origin) return base
  return base
}

export type OriginEnforcement =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; response: Response }

/** Rejects disallowed cross-origin callers with 403; sets ACAO when allowed. */
export function enforceRequestOrigin(req: Request, options?: { methods?: string }): OriginEnforcement {
  const allowed = getAllowedOrigins()
  const origin = req.headers.get('Origin')
  const base = corsBase(options)

  if (allowed.length === 0) {
    return { ok: true, headers: { ...base, 'Access-Control-Allow-Origin': '*' } }
  }

  if (origin) {
    const normalized = normalizeOrigin(origin)
    if (!allowed.includes(normalized)) {
      return {
        ok: false,
        response: Response.json(
          { error: 'Origin not allowed' },
          { status: 403, headers: base },
        ),
      }
    }
    return { ok: true, headers: { ...base, 'Access-Control-Allow-Origin': normalized } }
  }

  return { ok: true, headers: base }
}
