import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  FEEDBACK_MAX_BODY_BYTES,
  FEEDBACK_MAX_JSON_BYTES,
  feedbackImageFromBuffer,
  parseFeedbackBody,
  postFeedbackToDiscord,
  type FeedbackImageAttachment,
} from './discordFeedback'
import { parseMultipartFeedbackBody } from './feedbackMultipart'
import {
  checkFeedbackRateLimit,
  clientIpFromSocket,
  feedbackRateLimitFromEnv,
} from './feedbackRateLimit'

type EnvMap = Record<string, string>

function readBodyBuffer(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c) => {
      const buf = Buffer.from(c)
      total += buf.length
      if (total > maxBytes) {
        reject(new Error('body_too_large'))
        req.destroy()
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return readBodyBuffer(req, maxBytes).then((b) => b.toString('utf8'))
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://localhost')
}

async function handleFeedbackPost(req: IncomingMessage, res: ServerResponse, hook: string, env: EnvMap) {
  const rateCfg = feedbackRateLimitFromEnv(env)
  const ip = clientIpFromSocket(req.socket.remoteAddress)
  const limited = checkFeedbackRateLimit(`feedback:${ip}`, rateCfg)
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfterSec))
    sendJson(res, 429, { error: 'Too many requests' })
    return
  }

  const contentType = req.headers['content-type'] ?? ''
  const contentLength = Number(req.headers['content-length'])
  if (Number.isFinite(contentLength) && contentLength > FEEDBACK_MAX_BODY_BYTES) {
    sendJson(res, 413, { error: 'Request body too large' })
    return
  }

  try {
    if (contentType.includes('multipart/form-data')) {
      const raw = await readBodyBuffer(req, FEEDBACK_MAX_BODY_BYTES)
      const parts = parseMultipartFeedbackBody(raw, contentType)
      if ('error' in parts) {
        sendJson(res, 400, { error: parts.error })
        return
      }
      if (parts.payload.length > FEEDBACK_MAX_JSON_BYTES) {
        sendJson(res, 413, { error: 'Payload too large' })
        return
      }
      let json: unknown
      try {
        json = JSON.parse(parts.payload)
      } catch {
        sendJson(res, 400, { error: 'Invalid payload JSON' })
        return
      }
      const parsed = parseFeedbackBody(json)
      if ('error' in parsed) {
        sendJson(res, parsed.status, { error: parsed.error })
        return
      }
      let image: FeedbackImageAttachment | undefined
      if (parts.screenshot) {
        const img = feedbackImageFromBuffer(parts.screenshot.data, parts.screenshot.contentType)
        if ('error' in img) {
          sendJson(res, img.status, { error: img.error })
          return
        }
        image = img
      }
      const discord = await postFeedbackToDiscord(hook, parsed, image)
      if (!discord.ok) {
        sendJson(res, 502, { error: 'Discord webhook failed' })
        return
      }
      sendJson(res, 200, { ok: true })
      return
    }

    const rawBody = await readBody(req, FEEDBACK_MAX_JSON_BYTES)
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' })
      return
    }
    const parsed = parseFeedbackBody(body)
    if ('error' in parsed) {
      sendJson(res, parsed.status, { error: parsed.error })
      return
    }
    const discord = await postFeedbackToDiscord(hook, parsed)
    if (!discord.ok) {
      sendJson(res, 502, { error: 'Discord webhook failed' })
      return
    }
    sendJson(res, 200, { ok: true })
  } catch (e) {
    if (e instanceof Error && e.message === 'body_too_large') {
      sendJson(res, 413, { error: 'Request body too large' })
      return
    }
    sendJson(res, 502, { error: 'Discord webhook request failed' })
  }
}

/** Emula `POST /api/feedback` en dev (sin Vercel CLI). */
export function feedbackDevApiProxy(env: EnvMap): Plugin {
  return {
    name: 'feedback-dev-api-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (readUrl(req).pathname !== '/api/feedback') {
          next()
          return
        }
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' })
          return
        }
        const hook = env.DISCORD_FEEDBACK_WEBHOOK_URL?.trim()
        if (!hook) {
          sendJson(res, 503, { error: 'Feedback webhook not configured' })
          return
        }

        await handleFeedbackPost(req, res, hook, env)
      })
    },
  }
}
