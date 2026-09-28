/**
 * Vercel Edge Function — proxy FMP company profile (logo URL).
 * Evita exponer la API key en el cliente al resolver logos de tickers.
 */
export const config = { runtime: 'edge' }

import { cleanSymbol, enforceRequestOrigin, fmpKey } from '../lib/fmpSecurity'
import { checkFeedbackRateLimit, clientIpFromRequest } from '../lib/feedbackRateLimit'

const FMP_RATE_MAX = 60
const FMP_RATE_WINDOW_MS = 60_000

export default async function handler(req: Request): Promise<Response> {
  const origin = enforceRequestOrigin(req)
  if (!origin.ok) return origin.response
  const CORS = origin.headers

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })
  }

  const ip = clientIpFromRequest(req)
  const limited = checkFeedbackRateLimit(`fmp-logo:${ip}`, {
    max: FMP_RATE_MAX,
    windowMs: FMP_RATE_WINDOW_MS,
  })
  if (!limited.ok) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...CORS, 'Retry-After': String(limited.retryAfterSec) } },
    )
  }

  const raw = new URL(req.url).searchParams.get('symbol')?.trim()
  const symbol = raw ? cleanSymbol(raw) : ''
  if (!symbol) {
    return Response.json(
      { error: 'Missing or invalid symbol query parameter' },
      { status: 400, headers: CORS },
    )
  }

  const key = fmpKey()
  if (!key) {
    console.error('[api/logo] FMP API key not configured. Set FMP_API_KEY (or VITE_FMP_API_KEY) on the server.')
    return Response.json(
      { error: 'FMP API key not configured' },
      { status: 503, headers: CORS },
    )
  }

  const upstream =
    `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(symbol)}` +
    `?apikey=${encodeURIComponent(key)}`

  try {
    const res = await fetch(upstream)
    const body = await res.text()

    if (res.status === 401 || res.status === 403) {
      console.error('[api/logo] FMP rejected credentials', res.status, symbol)
      return Response.json(
        { error: 'FMP credentials rejected' },
        { status: res.status, headers: CORS },
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(body) as unknown
    } catch {
      parsed = null
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const msg = (parsed as { ['Error Message']?: unknown; error?: unknown })['Error Message']
        ?? (parsed as { error?: unknown }).error
      if (typeof msg === 'string' && msg.trim()) {
        const creds = /api key|invalid/i.test(msg)
        console.error('[api/logo] FMP error', msg, symbol)
        return Response.json(
          { error: msg.trim() },
          { status: creds ? 401 : 502, headers: CORS },
        )
      }
    }

    return new Response(body, {
      status: res.status,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    console.error('[api/logo] Upstream FMP request failed', symbol, err)
    return Response.json(
      { error: 'Upstream FMP request failed' },
      { status: 502, headers: CORS },
    )
  }
}
