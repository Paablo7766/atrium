import { useEffect, useState } from 'react'

export type DesktopUpdaterState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'restarting'
  | 'error'

export type DesktopUpdaterStatus = {
  supported: boolean
  currentVersion: string
  allowPrerelease: boolean
  state: DesktopUpdaterState
  availableVersion: string | null
  releaseNotes: string | null
  error: string | null
  downloadPercent: number | null
  /** True when the in-app notice should be shown (not snoozed this session). */
  offer: boolean
}

export function emptyUpdaterStatus(currentVersion = ''): DesktopUpdaterStatus {
  return {
    supported: false,
    currentVersion,
    allowPrerelease: false,
    state: 'idle',
    availableVersion: null,
    releaseNotes: null,
    error: null,
    downloadPercent: null,
    offer: false,
  }
}

export function isPrereleaseVersion(version: string): boolean {
  return version.includes('-')
}

export function shouldNotifyForVersion(opts: {
  current: string
  candidate: string
  allowPrerelease: boolean
  compare: (a: string, b: string) => number
}): boolean {
  if (opts.compare(opts.candidate, opts.current) <= 0) return false
  if (!opts.allowPrerelease && isPrereleaseVersion(opts.candidate)) return false
  return true
}

export function computeUpdateOffer(opts: {
  state: DesktopUpdaterState
  availableVersion: string | null
  dismissedVersion: string | null
}): boolean {
  if (opts.state === 'downloading' || opts.state === 'downloaded' || opts.state === 'restarting') return true
  if (opts.state !== 'available') return false
  if (!opts.availableVersion) return false
  return opts.availableVersion !== opts.dismissedVersion
}

/** After Update now, the in-app notice stays up until the process is replaced. */
export function canDismissUpdateModal(state: DesktopUpdaterState): boolean {
  return state === 'available' || state === 'error'
}

/**
 * NSIS with `oneClick: false` shows a wizard (and a “Continue” card if Atrium
 * is still running). Silent + force-relaunch skips that and reopens updated.
 */
export function nsisUpdateInstallOptions(): { isSilent: true; isForceRunAfter: true } {
  return { isSilent: true, isForceRunAfter: true }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function stripHtmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|h[1-6]|li|ul|ol|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .trim(),
  )
}

function cleanNoteLine(line: string): string {
  return line
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\[[^\]]*\]\(([^)]+)\)/g, '$1')
    .replace(/^\[.*?\]\s*/, '')
    .trim()
}

export function summarizeReleaseNotes(raw: string | null | undefined, max = 6): string[] {
  if (!raw?.trim()) return []

  const htmlItems = [...raw.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => stripHtmlToText(match[1]))
    .map(cleanNoteLine)
    .filter(Boolean)
  if (htmlItems.length) return htmlItems.slice(0, max)

  const source = /<\/?[a-z][\s\S]*>/i.test(raw) ? stripHtmlToText(raw) : raw
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#{1,6}\s/.test(line))

  const bullets = lines.filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)).map(cleanNoteLine).filter(Boolean)
  const picked = (bullets.length ? bullets : lines.map(cleanNoteLine).filter(Boolean)).slice(0, max)
  return picked
}

export function shouldShowUpdateModal(opts: {
  supported: boolean
  offer: boolean
  state: DesktopUpdaterState
  tutorialActive: boolean
  feedbackOpen: boolean
  whatsNewVisible: boolean
  tradeModalOpen?: boolean
}): boolean {
  if (!opts.supported || !opts.offer) return false
  if (opts.tutorialActive || opts.feedbackOpen || opts.whatsNewVisible || opts.tradeModalOpen) return false
  return (
    opts.state === 'available' ||
    opts.state === 'downloading' ||
    opts.state === 'downloaded' ||
    opts.state === 'restarting'
  )
}

export function useDesktopUpdaterStatus(): DesktopUpdaterStatus {
  const [status, setStatus] = useState<DesktopUpdaterStatus>(() => emptyUpdaterStatus())

  useEffect(() => {
    const api = window.api?.updater
    if (!api) return
    void api.getStatus().then(setStatus)
    return api.onStatus(setStatus)
  }, [])

  return status
}
