import { describe, expect, it } from 'vitest'
import { checkFeedbackRateLimit } from './feedbackRateLimit'

describe('checkFeedbackRateLimit', () => {
  it('allows up to max requests per window', () => {
    const key = `test-${Date.now()}-${Math.random()}`
    const opts = { max: 3, windowMs: 60_000 }
    expect(checkFeedbackRateLimit(key, opts)).toEqual({ ok: true })
    expect(checkFeedbackRateLimit(key, opts)).toEqual({ ok: true })
    expect(checkFeedbackRateLimit(key, opts)).toEqual({ ok: true })
    const blocked = checkFeedbackRateLimit(key, opts)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })
})
