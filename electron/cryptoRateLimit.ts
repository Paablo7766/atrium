/**
 * Best-effort rate limit for expensive crypto IPC (PBKDF2 unlock / derive).
 */
import { checkFeedbackRateLimit } from '../lib/feedbackRateLimit'

const UNLOCK_MAX = 15
const UNLOCK_WINDOW_MS = 5 * 60_000

export function checkCryptoUnlockRateLimit(senderId: number): { ok: true } | { ok: false; retryAfterSec: number } {
  return checkFeedbackRateLimit(`crypto-unlock:${senderId}`, {
    max: UNLOCK_MAX,
    windowMs: UNLOCK_WINDOW_MS,
  })
}
