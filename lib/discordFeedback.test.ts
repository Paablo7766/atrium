import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_MAX_IMAGE_BYTES,
  parseFeedbackBody,
  sniffImageContentType,
  feedbackImageFromBuffer,
  type FeedbackDiagnostics,
} from './discordFeedback'
import { parseMultipartFeedbackBody } from './feedbackMultipart'

const baseDiagnostics: FeedbackDiagnostics = {
  page: 'trades',
  path: '/trades',
  locale: 'es',
  viewport: '1280×720@1',
  cloudSync: 'off',
  dbLocked: false,
  loadErrorPresent: false,
  tradeCount: 12,
  accountCount: 2,
  activeAccountSlot: 1,
  currency: 'EUR',
  defaultMarket: 'forex',
  tradeModalOpen: false,
  statsRange: 'month',
  sidebarCollapsed: false,
  visibility: 'visible',
  utcOffset: '+02:00',
  openedFrom: 'sidebar',
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'bug',
    message: 'Something broke',
    appVersion: '1.0.0',
    platform: 'Web',
    os: 'Windows',
    repro: 'sometimes',
    diagnostics: baseDiagnostics,
    ...overrides,
  }
}

describe('parseFeedbackBody', () => {
  it('accepts a valid bug with diagnostics and repro', () => {
    const parsed = parseFeedbackBody(validBody())
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.kind).toBe('bug')
    expect(parsed.repro).toBe('sometimes')
    expect(parsed.diagnostics.page).toBe('trades')
  })

  it('requires repro for bugs', () => {
    const parsed = parseFeedbackBody(validBody({ repro: undefined }))
    expect(parsed).toMatchObject({ error: 'Missing repro for bug report', status: 400 })
  })

  it('rejects repro on suggestions when provided', () => {
    const parsed = parseFeedbackBody(validBody({ kind: 'suggestion', repro: 'always' }))
    expect(parsed).toMatchObject({ error: 'Repro only allowed for bugs', status: 400 })
  })

  it('accepts suggestion without repro', () => {
    const parsed = parseFeedbackBody(
      validBody({ kind: 'suggestion', repro: undefined, diagnostics: { ...baseDiagnostics, openedFrom: 'settings' } }),
    )
    expect('error' in parsed).toBe(false)
  })

  it('rejects IANA timezone ids', () => {
    const parsed = parseFeedbackBody(validBody({ diagnostics: { ...baseDiagnostics, utcOffset: 'Europe/Madrid' } }))
    expect(parsed).toMatchObject({ error: 'Invalid diagnostics.utcOffset', status: 400 })
  })
})

describe('sniffImageContentType', () => {
  it('detects png magic bytes', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])
    expect(sniffImageContentType(bytes)).toBe('image/png')
  })
})

describe('feedbackImageFromBuffer', () => {
  it('rejects oversize buffers', () => {
    const big = Buffer.alloc(FEEDBACK_MAX_IMAGE_BYTES + 1)
    big[0] = 0xff
    big[1] = 0xd8
    big[2] = 0xff
    const r = feedbackImageFromBuffer(big)
    expect(r).toMatchObject({ error: 'Screenshot too large', status: 413 })
  })
})

describe('parseMultipartFeedbackBody', () => {
  it('parses payload and png file parts', () => {
    const boundary = '----AtriumTest'
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
    const payload = JSON.stringify(validBody())
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${payload}\r\n`),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="screenshot"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const parsed = parseMultipartFeedbackBody(body, `multipart/form-data; boundary=${boundary}`)
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(JSON.parse(parsed.payload).message).toBe('Something broke')
    expect(parsed.screenshot?.data.length).toBe(png.length)
  })
})
