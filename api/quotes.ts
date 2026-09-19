/**
 * Vercel Edge Function — proxy FMP batch-quote.
 * La API key vive solo en el servidor (FMP_API_KEY o VITE_FMP_API_KEY).
 */
export const config = { runtime: 'edge' }

import { cleanSymbolsCsv, corsHeaders, fmpKey } from '../lib/fmpSecurity'

export default async function handler(req: Request): Promise<Response> {
  const CORS = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })
  }

  const raw = new URL(req.url).searchParams.get('symbols')?.trim()
  const symbols = raw ? cleanSymbolsCsv(raw) : ''
  if (!symbols) {
    return Response.json(
      { error: 'Missing or invalid symbols query parameter' },
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
    `https://financialmodelingprep.com/api/v3/batch-quote` +
    `?symbols=${encodeURIComponent(symbols)}` +
    `&apikey=${encodeURIComponent(key)}`

  try {
    const res = await fetch(upstream)
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    })
  } catch {
    return Response.json(
      { error: 'Upstream FMP request failed' },
      { status: 502, headers: CORS },
    )
  }
}
