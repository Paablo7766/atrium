import { cleanTicker } from '@/lib/ticker'
import { localTickerLogo } from '@/lib/tickerAssets'

const STORAGE_KEY = 'atrium.tickerLogoCache.v1'
const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000

type CacheEntry = { url: string | null; at: number }

const memory = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string | null>>()

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
  if (mem) return mem
  const stored = readStorage()[symbol]
  if (stored) {
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

async function fetchFmpLogo(symbol: string): Promise<string | null> {
  const res = await fetch(`/api/logo?symbol=${encodeURIComponent(symbol)}`)
  if (res.status === 503 || !res.ok) return null

  const data = (await res.json()) as Array<{ image?: string }> | { 'Error Message'?: string }
  if (!Array.isArray(data) || data.length === 0) return null

  const image = data[0]?.image?.trim()
  return image || null
}

/**
 * Resolve a logo URL for a ticker.
 * Order: local map → memory/localStorage cache → FMP profile API.
 */
export async function resolveTickerLogo(rawTicker: string): Promise<string | null> {
  const symbol = cleanTicker(rawTicker)
  if (!symbol) return null

  const local = localTickerLogo(symbol)
  if (local) {
    setCached(symbol, local)
    return local
  }

  const cached = getCached(symbol)
  if (cached?.url) return cached.url
  if (cached && isFreshNegative(cached)) return null

  const pending = inflight.get(symbol)
  if (pending) return pending

  const job = (async () => {
    try {
      const url = await fetchFmpLogo(symbol)
      setCached(symbol, url)
      return url
    } catch {
      setCached(symbol, null)
      return null
    } finally {
      inflight.delete(symbol)
    }
  })()

  inflight.set(symbol, job)
  return job
}

/** Synchronous peek used for instant paint when already known. */
export function peekTickerLogo(rawTicker: string): string | null | undefined {
  const symbol = cleanTicker(rawTicker)
  if (!symbol) return null

  const local = localTickerLogo(symbol)
  if (local) return local

  const cached = getCached(symbol)
  if (!cached) return undefined
  if (cached.url) return cached.url
  if (isFreshNegative(cached)) return null
  return undefined
}
