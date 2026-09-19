/**
 * Vercel Edge Function — proxy FMP company profile (logo URL).
 * Evita exponer la API key en el cliente al resolver logos de tickers.
 */
export const config = { runtime: 'edge' }

import { cleanSymbol, corsHeaders, fmpKey } from '../lib/fmpSecurity'

export default async function handler(req: Request): Promise<Response> {
  const CORS = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })
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
    return new Response(body, {
      status: res.status,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch {
    return Response.json(
      { error: 'Upstream FMP request failed' },
      { status: 502, headers: CORS },
    )
  }
}
