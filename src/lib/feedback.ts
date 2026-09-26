import { version as appVersion } from '../../package.json'
import { isDesktop } from '@/lib/db/client'
import type { FeedbackDiagnostics, FeedbackKind, FeedbackRepro } from '../../lib/discordFeedback'
import { FEEDBACK_MAX_IMAGE_BYTES } from '../../lib/discordFeedback'

function publicOrigin(): string {
  const fromEnv = (import.meta.env.VITE_ATRIUM_PUBLIC_ORIGIN ?? '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return window.location.origin
  }
  return ''
}

export function isFeedbackAvailable(): boolean {
  return publicOrigin().length > 0
}

export function feedbackPlatformLabel(): string {
  return isDesktop() ? 'Escritorio' : 'Web'
}

export function feedbackOsLabel(): string {
  if (isDesktop() && window.api?.platform) {
    const map: Record<string, string> = {
      win32: 'Windows',
      darwin: 'macOS',
      linux: 'Linux',
    }
    const name = map[window.api.platform] ?? window.api.platform
    return `${name} · ${navigator.userAgent}`
  }
  return navigator.userAgent || navigator.platform || 'Desconocido'
}

export type SubmitFeedbackInput = {
  kind: FeedbackKind
  message: string
  diagnostics: FeedbackDiagnostics
  repro?: FeedbackRepro
  screenshot?: File | null
}

function buildPayloadJson(input: SubmitFeedbackInput): string {
  const body: Record<string, unknown> = {
    kind: input.kind,
    message: input.message.trim(),
    appVersion,
    platform: feedbackPlatformLabel(),
    os: feedbackOsLabel(),
    diagnostics: input.diagnostics,
  }
  if (input.kind === 'bug' && input.repro) {
    body.repro = input.repro
  }
  return JSON.stringify(body)
}

export async function submitFeedback(input: SubmitFeedbackInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const origin = publicOrigin()
  if (!origin) {
    return { ok: false, error: 'unavailable' }
  }

  const screenshot = input.screenshot ?? null
  if (screenshot && screenshot.size > FEEDBACK_MAX_IMAGE_BYTES) {
    return { ok: false, error: 'image_too_large' }
  }

  const url = `${origin}/api/feedback`
  let res: Response

  if (screenshot) {
    const form = new FormData()
    form.append('payload', buildPayloadJson(input))
    form.append('screenshot', screenshot, screenshot.name || 'screenshot.png')
    res = await fetch(url, { method: 'POST', body: form })
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildPayloadJson(input),
    })
  }

  if (res.ok) return { ok: true }
  if (res.status === 503) return { ok: false, error: 'not_configured' }
  if (res.status === 413) return { ok: false, error: 'image_too_large' }
  return { ok: false, error: 'send_failed' }
}

export const FEEDBACK_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'

export function isAllowedFeedbackImageFile(file: File): boolean {
  if (file.size > FEEDBACK_MAX_IMAGE_BYTES) return false
  const t = file.type
  return t === 'image/png' || t === 'image/jpeg' || t === 'image/webp'
}
