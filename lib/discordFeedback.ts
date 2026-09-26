/**

 * Shared validation + Discord webhook formatting for beta feedback.

 */



export type FeedbackKind = 'bug' | 'suggestion'



export type FeedbackRepro = 'always' | 'sometimes' | 'once'



export type FeedbackOpenFrom = 'sidebar' | 'settings'



export type FeedbackDiagnostics = {

  page: string

  path: string

  locale: string

  viewport: string

  cloudSync: string

  dbLocked: boolean

  loadErrorPresent: boolean

  tradeCount: number

  accountCount: number

  activeAccountSlot: number

  currency: string

  defaultMarket: string

  tradeModalOpen: boolean

  statsRange: string

  sidebarCollapsed: boolean

  visibility: string

  utcOffset: string

  openedFrom: FeedbackOpenFrom

}



export type FeedbackPayload = {

  kind: FeedbackKind

  message: string

  appVersion: string

  platform: string

  os: string

  diagnostics: FeedbackDiagnostics

  repro?: FeedbackRepro

}



export type FeedbackImageAttachment = {

  buffer: ArrayBuffer

  contentType: 'image/png' | 'image/jpeg' | 'image/webp'

  filename: string

}



/** Max characters in the user message (enforced server-side and in the form). */

export const FEEDBACK_MAX_MESSAGE_LENGTH = 2000



/** Max total request size (JSON or multipart) on Edge. */

export const FEEDBACK_MAX_BODY_BYTES = 4 * 1024 * 1024



/** Max JSON-only body before parsing (no file). */

export const FEEDBACK_MAX_JSON_BYTES = 24_000



/** Max screenshot size. */

export const FEEDBACK_MAX_IMAGE_BYTES = FEEDBACK_MAX_BODY_BYTES



const MAX_MESSAGE = FEEDBACK_MAX_MESSAGE_LENGTH

const MAX_META = 120

const MAX_DIAG_STRING = 80

const MAX_PATH = 256



const APP_PAGES = new Set(['dashboard', 'trades', 'calendar', 'analytics', 'journal', 'settings'])

const REPRO_VALUES = new Set<FeedbackRepro>(['always', 'sometimes', 'once'])

const OPEN_FROM = new Set<FeedbackOpenFrom>(['sidebar', 'settings'])



function trimMeta(s: string): string {

  const t = s.trim()

  if (t.length <= MAX_META) return t

  return `${t.slice(0, MAX_META - 1)}…`

}



function trimDiag(s: string): string {

  const t = s.trim()

  if (t.length <= MAX_DIAG_STRING) return t

  return `${t.slice(0, MAX_DIAG_STRING - 1)}…`

}

function isValidUtcOffset(s: string): boolean {

  if (s === 'Z') return true

  return /^[+-]\d{2}:\d{2}$/.test(s)

}



function parseNonNegativeInt(v: unknown, max: number): number | null {

  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null

  const n = Math.floor(v)

  if (n > max) return null

  return n

}



function parseDiagnostics(raw: unknown): FeedbackDiagnostics | { error: string } {

  if (!raw || typeof raw !== 'object') return { error: 'Missing diagnostics' }

  const o = raw as Record<string, unknown>



  const page = typeof o.page === 'string' ? trimDiag(o.page) : ''

  if (!APP_PAGES.has(page)) return { error: 'Invalid diagnostics.page' }



  const path = typeof o.path === 'string' ? o.path.trim().slice(0, MAX_PATH) : ''

  if (!path.startsWith('/')) return { error: 'Invalid diagnostics.path' }



  const locale = typeof o.locale === 'string' ? trimDiag(o.locale) : ''

  if (!locale) return { error: 'Invalid diagnostics.locale' }



  const viewport = typeof o.viewport === 'string' ? trimDiag(o.viewport) : ''

  const cloudSync = typeof o.cloudSync === 'string' ? trimDiag(o.cloudSync) : ''

  if (!viewport || !cloudSync) return { error: 'Invalid diagnostics fields' }



  if (typeof o.dbLocked !== 'boolean' || typeof o.loadErrorPresent !== 'boolean') {

    return { error: 'Invalid diagnostics flags' }

  }

  if (typeof o.tradeModalOpen !== 'boolean' || typeof o.sidebarCollapsed !== 'boolean') {

    return { error: 'Invalid diagnostics UI flags' }

  }



  const tradeCount = parseNonNegativeInt(o.tradeCount, 1_000_000)

  const accountCount = parseNonNegativeInt(o.accountCount, 100)

  const activeAccountSlot = parseNonNegativeInt(o.activeAccountSlot, 100)

  if (tradeCount === null || accountCount === null || activeAccountSlot === null) {

    return { error: 'Invalid diagnostics counts' }

  }

  if (activeAccountSlot < 1 || activeAccountSlot > accountCount) {

    return { error: 'Invalid activeAccountSlot' }

  }



  const currency = typeof o.currency === 'string' ? trimDiag(o.currency) : ''

  const defaultMarket = typeof o.defaultMarket === 'string' ? trimDiag(o.defaultMarket) : ''

  const statsRange = typeof o.statsRange === 'string' ? trimDiag(o.statsRange) : ''

  const visibility = typeof o.visibility === 'string' ? trimDiag(o.visibility) : ''

  const utcOffsetRaw = typeof o.utcOffset === 'string' ? o.utcOffset.trim() : ''

  const openedFrom = o.openedFrom

  if (!currency || !defaultMarket || !statsRange || !visibility || !utcOffsetRaw) {

    return { error: 'Invalid diagnostics meta' }

  }

  if (!isValidUtcOffset(utcOffsetRaw)) {

    return { error: 'Invalid diagnostics.utcOffset' }

  }

  if (openedFrom !== 'sidebar' && openedFrom !== 'settings') {

    return { error: 'Invalid diagnostics.openedFrom' }

  }



  return {

    page,

    path,

    locale,

    viewport,

    cloudSync,

    dbLocked: o.dbLocked,

    loadErrorPresent: o.loadErrorPresent,

    tradeCount,

    accountCount,

    activeAccountSlot,

    currency,

    defaultMarket,

    tradeModalOpen: o.tradeModalOpen,

    statsRange,

    sidebarCollapsed: o.sidebarCollapsed,

    visibility,

    utcOffset: utcOffsetRaw,

    openedFrom,

  }

}



export function parseFeedbackBody(body: unknown): FeedbackPayload | { error: string; status: number } {

  if (!body || typeof body !== 'object') {

    return { error: 'Invalid JSON body', status: 400 }

  }

  const o = body as Record<string, unknown>

  const kind = o.kind

  if (kind !== 'bug' && kind !== 'suggestion') {

    return { error: 'Invalid kind (expected bug or suggestion)', status: 400 }

  }

  const message = typeof o.message === 'string' ? o.message.trim() : ''

  if (message.length < 3) {

    return { error: 'Message too short', status: 400 }

  }

  if (message.length > MAX_MESSAGE) {

    return { error: 'Message too long', status: 400 }

  }

  const appVersion = typeof o.appVersion === 'string' ? trimMeta(o.appVersion) : ''

  const platform = typeof o.platform === 'string' ? trimMeta(o.platform) : ''

  const os = typeof o.os === 'string' ? trimMeta(o.os) : ''

  if (!appVersion || !platform || !os) {

    return { error: 'Missing metadata fields', status: 400 }

  }



  const diagnostics = parseDiagnostics(o.diagnostics)

  if ('error' in diagnostics) {

    return { error: diagnostics.error, status: 400 }

  }



  let repro: FeedbackRepro | undefined

  if (o.repro !== undefined && o.repro !== null && o.repro !== '') {

    if (kind !== 'bug') {

      return { error: 'Repro only allowed for bugs', status: 400 }

    }

    if (typeof o.repro !== 'string' || !REPRO_VALUES.has(o.repro as FeedbackRepro)) {

      return { error: 'Invalid repro value', status: 400 }

    }

    repro = o.repro as FeedbackRepro

  } else if (kind === 'bug') {

    return { error: 'Missing repro for bug report', status: 400 }

  }



  return { kind, message, appVersion, platform, os, diagnostics, repro }

}



export function sniffImageContentType(bytes: Uint8Array): FeedbackImageAttachment['contentType'] | null {

  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {

    return 'image/png'

  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {

    return 'image/jpeg'

  }

  if (

    bytes.length >= 12 &&

    bytes[0] === 0x52 &&

    bytes[1] === 0x49 &&

    bytes[2] === 0x46 &&

    bytes[3] === 0x46 &&

    bytes[8] === 0x57 &&

    bytes[9] === 0x45 &&

    bytes[10] === 0x42 &&

    bytes[11] === 0x50

  ) {

    return 'image/webp'

  }

  return null

}



function extensionForContentType(ct: FeedbackImageAttachment['contentType']): string {

  if (ct === 'image/png') return 'png'

  if (ct === 'image/jpeg') return 'jpg'

  return 'webp'

}



export async function feedbackImageFromBlob(blob: Blob): Promise<FeedbackImageAttachment | { error: string; status: number }> {

  if (blob.size > FEEDBACK_MAX_IMAGE_BYTES) {

    return { error: 'Screenshot too large', status: 413 }

  }

  const buffer = await blob.arrayBuffer()

  const sniff = sniffImageContentType(new Uint8Array(buffer))

  if (!sniff) {

    return { error: 'Invalid screenshot type', status: 400 }

  }

  return {

    buffer,

    contentType: sniff,

    filename: `screenshot.${extensionForContentType(sniff)}`,

  }

}



export function feedbackImageFromBuffer(

  data: Buffer,

  declaredType?: string,

): FeedbackImageAttachment | { error: string; status: number } {

  if (data.length > FEEDBACK_MAX_IMAGE_BYTES) {

    return { error: 'Screenshot too large', status: 413 }

  }

  const sniff = sniffImageContentType(new Uint8Array(data))

  if (!sniff) {

    return { error: 'Invalid screenshot type', status: 400 }

  }

  if (declaredType && declaredType !== sniff && !declaredType.startsWith('image/')) {

    /* sniff wins for security */

  }

  const copy = new Uint8Array(data.length)
  copy.set(data)
  return {

    buffer: copy.buffer,

    contentType: sniff,

    filename: `screenshot.${extensionForContentType(sniff)}`,

  }

}



export type FeedbackParseOk = { ok: true; payload: FeedbackPayload; image?: FeedbackImageAttachment }

export type FeedbackParseFail = { ok: false; error: string; status: number }



function bodyTooLarge(): FeedbackParseFail {

  return { ok: false, error: 'Request body too large', status: 413 }

}



export function parseContentLengthHeader(req: Request): FeedbackParseFail | null {

  const cl = req.headers.get('content-length')

  if (!cl) return null

  const n = Number(cl)

  if (Number.isFinite(n) && n > FEEDBACK_MAX_BODY_BYTES) return bodyTooLarge()

  return null

}



export async function parseFeedbackRequest(req: Request): Promise<FeedbackParseOk | FeedbackParseFail> {

  const tooLarge = parseContentLengthHeader(req)

  if (tooLarge) return tooLarge



  const ct = req.headers.get('content-type') ?? ''



  if (ct.includes('multipart/form-data')) {

    let form: FormData

    try {

      form = await req.formData()

    } catch {

      return { ok: false, error: 'Invalid multipart body', status: 400 }

    }



    const payloadRaw = form.get('payload')

    if (typeof payloadRaw !== 'string') {

      return { ok: false, error: 'Missing payload field', status: 400 }

    }

    if (payloadRaw.length > FEEDBACK_MAX_JSON_BYTES) {

      return { ok: false, error: 'Payload too large', status: 413 }

    }



    let json: unknown

    try {

      json = JSON.parse(payloadRaw)

    } catch {

      return { ok: false, error: 'Invalid payload JSON', status: 400 }

    }



    const parsed = parseFeedbackBody(json)

    if ('error' in parsed) {

      return { ok: false, error: parsed.error, status: parsed.status }

    }



    const fileEntry = form.get('screenshot')

    if (fileEntry == null || fileEntry === '') {

      return { ok: true, payload: parsed }

    }

    if (typeof fileEntry === 'string') {

      return { ok: false, error: 'Invalid screenshot field', status: 400 }

    }



    const image = await feedbackImageFromBlob(fileEntry)

    if ('error' in image) {

      return { ok: false, error: image.error, status: image.status }

    }

    return { ok: true, payload: parsed, image }

  }



  let rawBody: string

  try {

    rawBody = await req.text()

  } catch {

    return { ok: false, error: 'Invalid body', status: 400 }

  }

  if (rawBody.length > FEEDBACK_MAX_JSON_BYTES) {

    return bodyTooLarge()

  }



  let body: unknown

  try {

    body = rawBody ? JSON.parse(rawBody) : null

  } catch {

    return { ok: false, error: 'Invalid JSON body', status: 400 }

  }



  const parsed = parseFeedbackBody(body)

  if ('error' in parsed) {

    return { ok: false, error: parsed.error, status: parsed.status }

  }

  return { ok: true, payload: parsed }

}



const REPRO_LABEL: Record<FeedbackRepro, string> = {

  always: 'Siempre',

  sometimes: 'A veces',

  once: 'Una vez',

}



function diagnosticsEmbedValue(d: FeedbackDiagnostics): string {

  const lines = [

    `Pantalla: ${d.page} · ${d.path}`,

    `Locale: ${d.locale} · UTC: ${d.utcOffset}`,

    `Viewport: ${d.viewport} · Visibilidad: ${d.visibility}`,

    `Sync: ${d.cloudSync} · DB bloqueada: ${d.dbLocked ? 'sí' : 'no'} · Error carga: ${d.loadErrorPresent ? 'sí' : 'no'}`,

    `Trades: ${d.tradeCount} · Cuentas: ${d.accountCount} (activa #${d.activeAccountSlot})`,

    `Moneda: ${d.currency} · Mercado: ${d.defaultMarket} · Rango stats: ${d.statsRange}`,

    `Modal trade: ${d.tradeModalOpen ? 'abierto' : 'cerrado'} · Sidebar: ${d.sidebarCollapsed ? 'colapsada' : 'expandida'}`,

    `Abierto desde: ${d.openedFrom}`,

  ]

  return lines.join('\n').slice(0, 1024)

}



function buildEmbed(payload: FeedbackPayload) {

  const isBug = payload.kind === 'bug'

  const title = isBug ? '🐛 Bug' : '💡 Sugerencia'

  const color = isBug ? 0xe74c3c : 0x3498db



  const fields: { name: string; value: string; inline?: boolean }[] = [

    { name: 'Versión', value: payload.appVersion.slice(0, 1024), inline: true },

    { name: 'Plataforma', value: payload.platform.slice(0, 1024), inline: true },

    { name: 'Sistema', value: payload.os.slice(0, 1024), inline: false },

    { name: 'Diagnóstico', value: diagnosticsEmbedValue(payload.diagnostics), inline: false },

  ]



  if (isBug && payload.repro) {

    fields.splice(3, 0, {

      name: 'Reproducibilidad',

      value: REPRO_LABEL[payload.repro],

      inline: true,

    })

  }



  return {

    title,

    description: payload.message.slice(0, 4096),

    color,

    fields,

    timestamp: new Date().toISOString(),

  }

}



export async function postFeedbackToDiscord(

  webhookUrl: string,

  payload: FeedbackPayload,

  image?: FeedbackImageAttachment,

): Promise<Response> {

  const embed = buildEmbed(payload)



  if (!image) {

    return fetch(webhookUrl, {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ embeds: [embed] }),

    })

  }



  const form = new FormData()

  form.append('payload_json', JSON.stringify({ embeds: [embed] }))

  form.append('files[0]', new Blob([image.buffer], { type: image.contentType }), image.filename)

  return fetch(webhookUrl, { method: 'POST', body: form })

}



/** @internal for tests */

export const _feedbackTest = { parseDiagnostics, OPEN_FROM, REPRO_VALUES }


