/**
 * Vercel Edge Function — reenvía feedback de beta testers a Discord (webhook server-only).
 */
export const config = { runtime: 'edge' }

import { corsHeaders } from '../lib/fmpSecurity'
import { parseFeedbackRequest, postFeedbackToDiscord } from '../lib/discordFeedback'
import {
  checkFeedbackRateLimit,
  clientIpFromRequest,
  feedbackRateLimitFromEnv,
} from '../lib/feedbackRateLimit'

function webhookUrl(): string | undefined {
  return process.env.DISCORD_FEEDBACK_WEBHOOK_URL?.trim() || undefined
}

export default async function handler(req: Request): Promise<Response> {
  const CORS = corsHeaders(req, { methods: 'POST, OPTIONS' })

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS })
  }

  const hook = webhookUrl()
  if (!hook) {
    return Response.json({ error: 'Feedback webhook not configured' }, { status: 503, headers: CORS })
  }

  const rateCfg = feedbackRateLimitFromEnv(process.env)
  const ip = clientIpFromRequest(req)
  const limited = checkFeedbackRateLimit(`feedback:${ip}`, rateCfg)
  if (!limited.ok) {
    return Response.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { ...CORS, 'Retry-After': String(limited.retryAfterSec) },
      },
    )
  }

  const parsed = await parseFeedbackRequest(req)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status, headers: CORS })
  }

  try {
    const discord = await postFeedbackToDiscord(hook, parsed.payload, parsed.image)
    if (!discord.ok) {
      return Response.json({ error: 'Discord webhook failed' }, { status: 502, headers: CORS })
    }
    return Response.json({ ok: true }, { status: 200, headers: CORS })
  } catch {
    return Response.json({ error: 'Discord webhook request failed' }, { status: 502, headers: CORS })
  }
}
