import { cleanTicker } from '@/lib/ticker'
import {
  fmpImageUrl,
  localTickerAsset,
  type TickerBadge,
} from '@/lib/tickerAssets'

// v4: CDN fallback for equities; do not persist auth failures as "no logo"
const STORAGE_KEY = 'atrium.tickerLogoCache.v4'
const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ERROR_TTL_MS = 60 * 1000

type CacheEntry = { url: string | null; at: number }

export type TickerLogoStatus = 'ok' | 'unavailable' | 'error'

export type TickerLogoResult = {
  url: string | null
  status: TickerLogoStatus
  /** Where a real URL came from. Null when there is no logo (or a transient error). */
  source: 'local' | 'fmp' | 'cache' | 'cdn' | null
  error?: string
  badge?: TickerBadge
}

type FmpLogoFetch =
  | { kind: 'url'; url: string }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string; status?: number }

const memory = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<TickerLogoResult>>()
/** Memory-only: do not persist auth/network failures as "no logo". */
const recentErrors = new Map<string, { at: number; message: string }>()

function readStorage(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStorage(all: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Quota / private mode — memory cache still works
  }
}

function getCached(symbol: string): CacheEntry | undefined {
  const mem = memory.get(symbol)
  if (mem) {
    if (mem.url && !isSafeLogoUrl(mem.url)) return undefined
    return mem
  }
  const stored = readStorage()[symbol]
  if (stored) {
    if (stored.url && !isSafeLogoUrl(stored.url)) return undefined
    memory.set(symbol, stored)
    return stored
  }
  return undefined
}

function setCached(symbol: string, url: string | null) {
  const entry: CacheEntry = { url, at: Date.now() }
  memory.set(symbol, entry)
  const all = readStorage()
  all[symbol] = entry
  writeStorage(all)
}

function isFreshNegative(entry: CacheEntry): boolean {
  return entry.url === null && Date.now() - entry.at < NEGATIVE_TTL_MS
}

function getRecentError(symbol: string): { message: string } | undefined {
  const hit = recentErrors.get(symbol)
  if (!hit) return undefined
  if (Date.now() - hit.at >= ERROR_TTL_MS) {
    recentErrors.delete(symbol)
    return undefined
  }
  return hit
}

function isSafeLogoUrl(url: string): boolean {
  try {
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('data:image/')) return true
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function fmpErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
  const rec = data as Record<string, unknown>
  const msg = rec['Error Message'] ?? rec.error
  return typeof msg === 'string' && msg.trim() ? msg.trim() : undefined
}

function logLogoError(message: string, details: Record<string, unknown>) {
  console.error(`[tickerLogo] ${message}`, details)
}

function localResult(symbol: string): TickerLogoResult | undefined {
  const local = localTickerAsset(symbol)
  if (!local) return undefined
  if (local.type === 'url') {
    setCached(symbol, local.url)
    return { url: local.url, status: 'ok', source: 'local' }
  }
  return { url: null, status: 'ok', source: 'local', badge: local.badge }
}

function cdnResult(symbol: string, persist = false): TickerLogoResult {
  const url = fmpImageUrl(symbol)
  if (persist) setCached(symbol, url)
  return { url, status: 'ok', source: 'cdn' }
}

/**
 * Network boundary: FMP must only ever see a cleaned symbol (no broker suffixes).
 * The API key stays on the server (`FMP_API_KEY` / `VITE_FMP_API_KEY` via `/api/logo`).
 */
async function fetchFmpLogo(rawOrClean: string): Promise<FmpLogoFetch> {
  const symbol = cleanTicker(rawOrClean)
  if (!symbol) return { kind: 'unavailable' }

  let res: Response
  try {
    res = await fetch(`/api/logo?symbol=${encodeURIComponent(symbol)}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error calling /api/logo'
    logLogoError(message, { symbol, err })
    return { kind: 'error', message }
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch (err) {
    const message = `Invalid JSON from /api/logo (${res.status})`
    logLogoError(message, { symbol, status: res.status, err })
    return { kind: 'error', message, status: res.status }
  }

  const bodyError = fmpErrorMessage(data)

  if (res.status === 503) {
    const message =
      bodyError ?? 'FMP API key not configured. Set FMP_API_KEY on the server (Vercel / Vite proxy).'
    logLogoError(message, { symbol, status: 503 })
    return { kind: 'error', message, status: 503 }
  }

  if (res.status === 401 || res.status === 403) {
    const message = bodyError ?? `FMP rejected credentials (${res.status})`
    logLogoError(message, { symbol, status: res.status })
    return { kind: 'error', message, status: res.status }
  }

  if (!res.ok) {
    if (res.status === 404) return { kind: 'unavailable' }
    const message = bodyError ?? `Logo proxy failed (${res.status})`
    logLogoError(message, { symbol, status: res.status })
    return { kind: 'error', message, status: res.status }
  }

  if (bodyError) {
    logLogoError(bodyError, { symbol })
    return { kind: 'error', message: bodyError }
  }

  if (!Array.isArray(data) || data.length === 0) return { kind: 'unavailable' }

  const first = data[0]
  if (!first || typeof first !== 'object') return { kind: 'unavailable' }
  const image = typeof (first as { image?: unknown }).image === 'string'
    ? (first as { image: string }).image.trim()
    : ''
  if (!image || !isSafeLogoUrl(image)) return { kind: 'unavailable' }
  return { kind: 'url', url: image }
}

/**
 * Resolve a logo URL for a ticker.
 * Order: local map (crypto / index stand-ins / FX badges) → cache → FMP `/api/logo`
 * → public FMP image CDN (no API key).
 * Credential / network failures are logged and fall back to the CDN — never stored as "no logo".
 */
export async function resolveTickerLogo(rawTicker: string): Promise<TickerLogoResult> {
  const symbol = cleanTicker(rawTicker)
  if (!symbol) return { url: null, status: 'unavailable', source: null }

  const local = localResult(symbol)
  if (local) return local

  const cached = getCached(symbol)
  if (cached?.url) return { url: cached.url, status: 'ok', source: 'cache' }

  const recent = getRecentError(symbol)
  if (recent) return cdnResult(symbol)

  // Stale "no logo" from an older path — show the public CDN instead of staying blank
  if (cached && isFreshNegative(cached)) return cdnResult(symbol)

  const pending = inflight.get(symbol)
  if (pending) return pending

  const job = (async (): Promise<TickerLogoResult> => {
    try {
      const fetched = await fetchFmpLogo(symbol)
      if (fetched.kind === 'url') {
        recentErrors.delete(symbol)
        setCached(symbol, fetched.url)
        return { url: fetched.url, status: 'ok', source: 'fmp' }
      }
      if (fetched.kind === 'unavailable') {
        recentErrors.delete(symbol)
        return cdnResult(symbol, true)
      }
      recentErrors.set(symbol, { at: Date.now(), message: fetched.message })
      return { ...cdnResult(symbol), error: fetched.message }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Logo lookup failed'
      logLogoError('unexpected error', { symbol, err })
      recentErrors.set(symbol, { at: Date.now(), message })
      return { ...cdnResult(symbol), error: message }
    } finally {
      inflight.delete(symbol)
    }
  })()

  inflight.set(symbol, job)
  return job
}

/** Synchronous peek used for instant paint when already known. */
export function peekTickerLogo(rawTicker: string): string | null | undefined {
  return peekTickerLogoState(rawTicker).url ?? undefined
}

/** Full synchronous snapshot: local URL/badge, cache, or public CDN for equities. */
export function peekTickerLogoState(rawTicker: string): TickerLogoResult {
  const symbol = cleanTicker(rawTicker)
  if (!symbol) return { url: null, status: 'unavailable', source: null }

  const local = localTickerAsset(symbol)
  if (local?.type === 'url') return { url: local.url, status: 'ok', source: 'local' }
  if (local?.type === 'badge') return { url: null, status: 'ok', source: 'local', badge: local.badge }

  const cached = getCached(symbol)
  if (cached?.url) return { url: cached.url, status: 'ok', source: 'cache' }

  return { url: fmpImageUrl(symbol), status: 'ok', source: 'cdn' }
}

/** Test helper — clears memory, inflight, error TTL and persisted cache. */
export function resetTickerLogoCaches() {
  memory.clear()
  inflight.clear()
  recentErrors.clear()
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem('atrium.tickerLogoCache.v3')
  } catch {
    // ignore
  }
}
