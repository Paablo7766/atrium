/**
 * Best-effort in-memory rate limit (per Edge isolate / dev server process).
 * Stops casual direct POST spam; not a global DDoS shield.
 */

export const FEEDBACK_RATE_LIMIT_DEFAULT_MAX = 5
export const FEEDBACK_RATE_LIMIT_DEFAULT_WINDOW_MS = 60_000

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000

export function clientIpFromRequest(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  return 'unknown'
}

export function clientIpFromSocket(remoteAddress: string | undefined): string {
  const ip = remoteAddress?.trim()
  return ip && ip.length > 0 ? ip : 'unknown'
}

function pruneExpired(now: number) {
  if (buckets.size <= MAX_BUCKETS) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number }

export function checkFeedbackRateLimit(
  key: string,
  options?: { max?: number; windowMs?: number },
): RateLimitResult {
  const max = options?.max ?? FEEDBACK_RATE_LIMIT_DEFAULT_MAX
  const windowMs = options?.windowMs ?? FEEDBACK_RATE_LIMIT_DEFAULT_WINDOW_MS
  const now = Date.now()
  pruneExpired(now)

  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 1, resetAt: now + windowMs }
    buckets.set(key, bucket)
    return { ok: true }
  }

  if (bucket.count >= max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }

  bucket.count += 1
  return { ok: true }
}

export function feedbackRateLimitFromEnv(env: Record<string, string | undefined>): {
  max: number
  windowMs: number
} {
  const maxRaw = Number(env.FEEDBACK_RATE_LIMIT_MAX ?? FEEDBACK_RATE_LIMIT_DEFAULT_MAX)
  const windowSecRaw = Number(env.FEEDBACK_RATE_LIMIT_WINDOW_SEC ?? '60')
  const max =
    Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(Math.floor(maxRaw), 100) : FEEDBACK_RATE_LIMIT_DEFAULT_MAX
  const windowSec =
    Number.isFinite(windowSecRaw) && windowSecRaw > 0 ? Math.min(Math.floor(windowSecRaw), 3600) : 60
  return { max, windowMs: windowSec * 1000 }
}
