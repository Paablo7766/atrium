import { endOfMonth, endOfWeek, format, getWeek, startOfMonth, startOfWeek } from 'date-fns'
import type { Cashflow, Currency, Trade } from '@/types'
import { capitalize, fmtMoney, fmtNum, fmtPct, fmtPrice, fmtR, toDateKey } from './format'
import { closedTrades, computeStats, tradePnl, tradeR, tradeReturnPct } from './stats'
import { equityBefore } from './range'
import { dateFnsLocale, directionLabel, getAppLocale, marketLabel, t, type MessageKey } from './i18n'

export const SHARE_W = 1600
export const SHARE_H = 900

export type ShareTheme = 'orbit' | 'editorial' | 'signal' | 'folio'

export const SHARE_THEMES: { id: ShareTheme; labelKey: MessageKey }[] = [
  { id: 'orbit', labelKey: 'share.themeOrbit' },
  { id: 'editorial', labelKey: 'share.themeEditorial' },
  { id: 'signal', labelKey: 'share.themeSignal' },
  { id: 'folio', labelKey: 'share.themeFolio' },
]

export type ShareTarget =
  | { kind: 'trade'; tradeId: string }
  | { kind: 'week'; start: string }
  | { kind: 'month'; month: string }

export type ShareRow = { label: string; value: string; tone?: 'up' | 'down' | 'muted' }

export type ShareModel = {
  traderName: string
  accountName: string
  kicker: string
  meta: string
  pnl: number
  pnlText: string
  rows: ShareRow[]
  headline: string
  filename: string
}

const FONT = '"Outfit Variable", Outfit, Inter, system-ui, sans-serif'

function tradesInKeys(trades: Trade[], fromKey: string, toKey: string) {
  return closedTrades(trades).filter((tr) => {
    const k = toDateKey(tr.exitDate ?? tr.entryDate)
    return k >= fromKey && k <= toKey
  })
}

function headlineFor(kind: ShareTarget['kind'], pnl: number, winRate: number, r: number | null) {
  const locale = getAppLocale()
  if (kind === 'trade') {
    if (pnl > 0 && r != null && r >= 2) return t(locale, 'share.planPaid')
    if (pnl > 0) return t(locale, 'share.goodRead')
    if (pnl < 0) return t(locale, 'share.stopWorked')
    return t(locale, 'share.scratch')
  }
  if (pnl > 0 && winRate >= 55) return t(locale, kind === 'week' ? 'share.weekEdge' : 'share.monthEdge')
  if (pnl > 0) return t(locale, kind === 'week' ? 'share.weekGreen' : 'share.monthGreen')
  if (pnl < 0) return t(locale, kind === 'week' ? 'share.weekHold' : 'share.monthHold')
  return t(locale, 'share.flat')
}

export function weekBounds(anchor: Date, weekStartsOn: 0 | 1) {
  const start = startOfWeek(anchor, { weekStartsOn })
  const end = endOfWeek(anchor, { weekStartsOn })
  return { start, end }
}

export function buildShareModel(
  target: ShareTarget,
  opts: {
    trades: Trade[]
    settings: { traderName: string; accountName: string; currency: Currency; startingBalance: number; weekStartsOn: 0 | 1 }
    cashflows: Cashflow[]
  },
): ShareModel | null {
  const { trades, settings, cashflows } = opts
  const locale = getAppLocale()
  const df = dateFnsLocale(locale)
  const name = settings.traderName?.trim() || 'Trader'
  const account = settings.accountName?.trim() || t(locale, 'share.account')
  const ccy = settings.currency
  const weekStartsOn = settings.weekStartsOn === 0 ? 0 : 1

  if (target.kind === 'trade') {
    const tr = trades.find((x) => x.id === target.tradeId)
    if (!tr || tr.status !== 'CLOSED') return null
    const pnl = tradePnl(tr)
    const r = tradeR(tr)
    const ret = tradeReturnPct(tr)
    const side =
      tr.direction === 'NONE' ? t(locale, 'share.spot') : directionLabel(locale, tr.direction)
    const when = capitalize(format(new Date(tr.exitDate ?? tr.entryDate), 'd MMM yyyy', { locale: df }))
    const rows: ShareRow[] = [
      { label: t(locale, 'share.entry'), value: fmtPrice(tr.entryPrice), tone: 'muted' },
      { label: t(locale, 'share.exit'), value: tr.exitPrice !== undefined ? fmtPrice(tr.exitPrice) : '—', tone: 'muted' },
      { label: 'R', value: fmtR(r), tone: r == null ? 'muted' : r >= 0 ? 'up' : 'down' },
      { label: t(locale, 'share.return'), value: ret == null ? '—' : fmtPct(ret, 2, { sign: true }), tone: ret == null ? 'muted' : ret >= 0 ? 'up' : 'down' },
      { label: t(locale, 'share.strategy'), value: tr.strategy || '—', tone: 'muted' },
      { label: t(locale, 'share.market'), value: marketLabel(locale, tr.market), tone: 'muted' },
    ]
    return {
      traderName: name,
      accountName: account,
      kicker: `${tr.symbol}  ·  ${side}`,
      meta: when,
      pnl,
      pnlText: fmtMoney(pnl, ccy, { sign: true, decimals: Math.abs(pnl) >= 10000 ? 0 : 2 }),
      rows,
      headline: headlineFor('trade', pnl, 0, r),
      filename: `atrium-${tr.symbol.toLowerCase()}-${toDateKey(tr.exitDate ?? tr.entryDate)}.png`,
    }
  }

  let from: Date
  let to: Date
  let kicker: string
  let filename: string
  if (target.kind === 'week') {
    const anchor = new Date(`${target.start}T12:00:00`)
    const b = weekBounds(anchor, weekStartsOn)
    from = b.start
    to = b.end
    const n = getWeek(b.start, { weekStartsOn, firstWeekContainsDate: weekStartsOn === 0 ? 1 : 4 })
    kicker = locale === 'en' ? `Week ${n}` : `Semana ${n}`
    filename = `atrium-semana-${format(b.start, 'yyyy-ww')}.png`
  } else {
    const [y, m] = target.month.split('-').map(Number)
    from = startOfMonth(new Date(y, m - 1, 1))
    to = endOfMonth(from)
    kicker = capitalize(format(from, 'MMMM yyyy', { locale: df }))
    filename = `atrium-${format(from, 'yyyy-MM')}.png`
  }

  const fromKey = format(from, 'yyyy-MM-dd')
  const toKey = format(to, 'yyyy-MM-dd')
  const slice = tradesInKeys(trades, fromKey, toKey)
  if (!slice.length) return null
  const base = equityBefore(trades, from, settings.startingBalance, cashflows)
  const stats = computeStats(slice, base)
  const ret = base ? (stats.netPnl / base) * 100 : null
  const rangeLabel = `${format(from, 'd MMM', { locale: df })} – ${format(to, 'd MMM yyyy', { locale: df })}`
  const rows: ShareRow[] = [
    { label: 'Win rate', value: `${fmtNum(stats.winRate, 0)}%`, tone: stats.winRate >= 50 ? 'up' : 'down' },
    {
      label: 'W / L',
      value: `${stats.wins}W / ${stats.losses}L`,
      tone: 'muted',
    },
    {
      label: 'Profit factor',
      value: stats.profitFactor === Infinity ? '∞' : fmtNum(stats.profitFactor, 2),
      tone: 'muted',
    },
    {
      label: t(locale, 'share.return'),
      value: ret == null ? '—' : fmtPct(ret, 1, { sign: true }),
      tone: ret == null ? 'muted' : ret >= 0 ? 'up' : 'down',
    },
    {
      label: t(locale, 'share.bestDay'),
      value: stats.bestDay ? fmtMoney(stats.bestDay.pnl, ccy, { sign: true }) : '—',
      tone: stats.bestDay && stats.bestDay.pnl >= 0 ? 'up' : 'muted',
    },
    {
      label: t(locale, 'share.expectancy'),
      value: fmtMoney(stats.expectancy, ccy, { sign: true }),
      tone: stats.expectancy >= 0 ? 'up' : 'down',
    },
  ]

  const opsWord =
    locale === 'en'
      ? stats.total === 1
        ? 'trade'
        : 'trades'
      : stats.total === 1
        ? 'operación'
        : 'ops'

  return {
    traderName: name,
    accountName: account,
    kicker,
    meta: `${rangeLabel}  ·  ${stats.total} ${opsWord}`,
    pnl: stats.netPnl,
    pnlText: fmtMoney(stats.netPnl, ccy, { sign: true, decimals: Math.abs(stats.netPnl) >= 10000 ? 0 : 2 }),
    rows,
    headline: headlineFor(target.kind, stats.netPnl, stats.winRate, null),
    filename,
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number) {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (i * Math.PI) / 4 - Math.PI / 2
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function toneColor(tone: ShareRow['tone'] | undefined, dark: boolean) {
  if (tone === 'up') return '#4ade80'
  if (tone === 'down') return '#f87171'
  return dark ? '#e4e4e7' : '#18181b'
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function drawLogoMark(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  opts?: { halo?: boolean; light?: boolean },
) {
  const r = size * 0.22
  if (opts?.halo !== false) {
    const halo = ctx.createRadialGradient(x + size / 2, y + size / 2, 4, x + size / 2, y + size / 2, size * 0.95)
    halo.addColorStop(0, opts?.light ? 'rgba(24,24,27,0.12)' : 'rgba(74,222,128,0.22)')
    halo.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size * 0.85, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = opts?.light ? '#fafafa' : '#111114'
  roundRect(ctx, x, y, size, size, r)
  ctx.fill()

  if (logo) {
    ctx.save()
    roundRect(ctx, x, y, size, size, r)
    ctx.clip()
    ctx.drawImage(logo, x, y, size, size)
    ctx.restore()
  } else {
    ctx.fillStyle = '#4ade80'
    roundRect(ctx, x + 10, y + 10, size - 20, size - 20, r * 0.7)
    ctx.fill()
  }

  ctx.strokeStyle = opts?.light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1.5
  roundRect(ctx, x + 0.75, y + 0.75, size - 1.5, size - 1.5, r)
  ctx.stroke()
}

/** Motivo decorativo premium a la derecha (estrella + órbitas + glow). */
function drawArt(ctx: CanvasRenderingContext2D, positive: boolean) {
  const cx = 1240
  const cy = 470
  ctx.save()

  const glow = ctx.createRadialGradient(cx, cy, 40, cx, cy, 540)
  glow.addColorStop(0, positive ? 'rgba(74,222,128,0.22)' : 'rgba(248,113,113,0.18)')
  glow.addColorStop(0.4, 'rgba(90,140,255,0.09)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(780, 0, 820, 900)

  ctx.translate(cx, cy)

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1.25
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(0, 0, 148 + i * 72, 0, Math.PI * 2)
    ctx.stroke()
  }

  const n = 28
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const inner = 116
    const outer = i % 2 === 0 ? 170 : 146
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner)
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer)
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(220,225,235,0.2)' : 'rgba(90,140,255,0.26)'
    ctx.lineWidth = i % 2 === 0 ? 3 : 1.75
    ctx.stroke()
  }

  const shards: [number, number, number, number, number, string][] = [
    [210, -280, 38, 0.55, 18, 'rgba(90,140,255,0.85)'],
    [280, -40, 26, 1.2, 12, 'rgba(255,255,255,0.78)'],
    [180, 220, 44, -0.4, 16, positive ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,113,0.55)'],
    [-90, -300, 22, 0.9, 10, 'rgba(160,190,255,0.7)'],
    [40, 310, 30, 0.2, 11, 'rgba(255,255,255,0.18)'],
  ]
  for (const [sx, sy, s, rot, h, color] of shards) {
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(rot)
    ctx.beginPath()
    ctx.moveTo(0, -s)
    ctx.lineTo(h, s * 0.4)
    ctx.lineTo(-h * 0.4, s * 0.55)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
  }

  drawStar(ctx, 0, 0, 108, 28)
  const star = ctx.createLinearGradient(-70, -70, 70, 70)
  star.addColorStop(0, '#d4d4d8')
  star.addColorStop(0.45, '#fafafa')
  star.addColorStop(1, '#a1a1aa')
  ctx.fillStyle = star
  ctx.fill()

  ctx.restore()

  const fade = ctx.createLinearGradient(740, 0, 1100, 0)
  fade.addColorStop(0, '#08080a')
  fade.addColorStop(1, 'rgba(8,8,10,0)')
  ctx.fillStyle = fade
  ctx.fillRect(740, 0, 380, 900)
}

function drawBrandHeader(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  model: ShareModel,
  x: number,
  y: number,
  opts?: { light?: boolean; rightLabel?: string },
) {
  const light = opts?.light
  drawLogoMark(ctx, logo, x, y, 56, { light, halo: !light })

  ctx.font = `600 15px ${FONT}`
  ctx.fillStyle = light ? '#71717a' : '#8a8a94'
  ctx.letterSpacing = '0.32em'
  ctx.fillText('ATRIUM', x + 74, y + 24)
  ctx.letterSpacing = '0px'
  ctx.font = `500 13px ${FONT}`
  ctx.fillStyle = light ? '#a1a1aa' : '#5b5b65'
  const account = truncate(model.accountName, 28)
  ctx.fillText(account.toUpperCase(), x + 74, y + 46)

  ctx.textAlign = 'right'
  ctx.font = `500 13px ${FONT}`
  ctx.fillStyle = light ? '#a1a1aa' : '#52525b'
  ctx.fillText(opts?.rightLabel ?? 'ATRIUM', SHARE_W - 72, y + 36)
  ctx.textAlign = 'left'
}

// ─── Theme: Orbit (original) ───────────────────────────────────────────────

function renderOrbit(ctx: CanvasRenderingContext2D, model: ShareModel, logo: HTMLImageElement | null) {
  const positive = model.pnl >= 0
  const accent = model.pnl > 0 ? '#4ade80' : model.pnl < 0 ? '#f87171' : '#e4e4e7'

  ctx.fillStyle = '#08080a'
  ctx.fillRect(0, 0, SHARE_W, SHARE_H)

  const topSheen = ctx.createLinearGradient(0, 0, 0, 120)
  topSheen.addColorStop(0, 'rgba(255,255,255,0.04)')
  topSheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = topSheen
  ctx.fillRect(0, 0, SHARE_W, 120)

  const edge = ctx.createLinearGradient(88, 0, SHARE_W - 88, 0)
  edge.addColorStop(0, 'rgba(74,222,128,0)')
  edge.addColorStop(0.35, positive ? 'rgba(74,222,128,0.45)' : 'rgba(248,113,113,0.4)')
  edge.addColorStop(0.65, 'rgba(90,140,255,0.35)')
  edge.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, SHARE_W, 2)

  const leftGlow = ctx.createRadialGradient(220, 200, 20, 220, 200, 480)
  leftGlow.addColorStop(0, positive ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)')
  leftGlow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = leftGlow
  ctx.fillRect(0, 0, 700, 700)

  drawArt(ctx, positive)

  const x = 88
  let y = 72

  drawBrandHeader(ctx, logo, model, x, y)

  y = 210
  ctx.font = `600 58px ${FONT}`
  ctx.fillStyle = '#f4f4f5'
  ctx.fillText(truncate(model.traderName, 22), x, y)

  ctx.font = `500 22px ${FONT}`
  ctx.fillStyle = '#a1a1aa'
  ctx.fillText(model.kicker, x, y + 48)

  ctx.font = `500 17px ${FONT}`
  ctx.fillStyle = '#5b5b65'
  ctx.fillText(model.meta, x, y + 80)

  y = 368
  ctx.font = `700 46px ${FONT}`
  const pnlW = Math.max(280, ctx.measureText(model.pnlText).width + 64)
  const pnlH = 88

  ctx.fillStyle = positive ? 'rgba(74,222,128,0.18)' : model.pnl < 0 ? 'rgba(248,113,113,0.16)' : 'rgba(255,255,255,0.06)'
  roundRect(ctx, x + 4, y + 8, pnlW, pnlH, 18)
  ctx.fill()

  ctx.fillStyle = accent
  roundRect(ctx, x, y, pnlW, pnlH, 18)
  ctx.fill()

  ctx.font = `700 46px ${FONT}`
  ctx.fillStyle = '#08080a'
  ctx.fillText(model.pnlText, x + 28, y + 58)

  y = 500
  const tileW = 292
  const tileH = 78
  const gapX = 28
  const gapY = 18
  model.rows.slice(0, 6).forEach((row, i) => {
    const col = i % 2
    const rowi = Math.floor(i / 2)
    const rx = x + col * (tileW + gapX)
    const ry = y + rowi * (tileH + gapY)

    ctx.fillStyle = 'rgba(255,255,255,0.028)'
    roundRect(ctx, rx, ry, tileW, tileH, 14)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    roundRect(ctx, rx + 0.5, ry + 0.5, tileW - 1, tileH - 1, 14)
    ctx.stroke()

    ctx.font = `500 12px ${FONT}`
    ctx.fillStyle = '#5b5b65'
    ctx.letterSpacing = '0.14em'
    ctx.fillText(row.label.toUpperCase(), rx + 18, ry + 28)
    ctx.letterSpacing = '0px'

    ctx.font = `600 24px ${FONT}`
    ctx.fillStyle = toneColor(row.tone, true)
    ctx.fillText(truncate(row.value, 16), rx + 18, ry + 58)
  })

  ctx.font = `600 34px ${FONT}`
  ctx.fillStyle = '#f4f4f5'
  ctx.fillText(model.headline, x, 820)

  ctx.font = `500 14px ${FONT}`
  ctx.fillStyle = '#3f3f46'
  ctx.fillText(t(getAppLocale(), 'share.tagline'), x, 856)

  ctx.textAlign = 'right'
  ctx.font = `500 12px ${FONT}`
  ctx.fillStyle = '#2a2a31'
  ctx.fillText('atrium.journal', SHARE_W - 72, 856)
  ctx.textAlign = 'left'
}

// ─── Theme: Editorial (Swiss / typographic) ─────────────────────────────────

function renderEditorial(ctx: CanvasRenderingContext2D, model: ShareModel, logo: HTMLImageElement | null) {
  const positive = model.pnl >= 0
  const accent = model.pnl > 0 ? '#4ade80' : model.pnl < 0 ? '#f87171' : '#a1a1aa'

  ctx.fillStyle = '#0a0a0b'
  ctx.fillRect(0, 0, SHARE_W, SHARE_H)

  // Fine vertical rule
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(88, 120)
  ctx.lineTo(88, 780)
  ctx.stroke()

  // Accent bar at left edge
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, 6, SHARE_H)

  const x = 120
  drawLogoMark(ctx, logo, x, 64, 48, { halo: false })

  ctx.font = `600 13px ${FONT}`
  ctx.fillStyle = '#71717a'
  ctx.letterSpacing = '0.28em'
  ctx.fillText('ATRIUM', x + 64, 84)
  ctx.letterSpacing = '0px'
  ctx.font = `500 12px ${FONT}`
  ctx.fillStyle = '#52525b'
  ctx.fillText(truncate(model.accountName, 32).toUpperCase(), x + 64, 106)

  ctx.textAlign = 'right'
  ctx.font = `500 12px ${FONT}`
  ctx.fillStyle = '#3f3f46'
  ctx.letterSpacing = '0.2em'
  ctx.fillText('RECAP', SHARE_W - 88, 94)
  ctx.letterSpacing = '0px'
  ctx.textAlign = 'left'

  // Top rule
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.moveTo(x, 140)
  ctx.lineTo(SHARE_W - 88, 140)
  ctx.stroke()

  ctx.font = `500 18px ${FONT}`
  ctx.fillStyle = '#71717a'
  ctx.fillText(model.kicker, x, 188)

  ctx.font = `600 42px ${FONT}`
  ctx.fillStyle = '#fafafa'
  ctx.fillText(truncate(model.traderName, 28), x, 248)

  ctx.font = `500 16px ${FONT}`
  ctx.fillStyle = '#52525b'
  ctx.fillText(model.meta, x, 284)

  // Massive P&L
  ctx.font = `700 120px ${FONT}`
  ctx.fillStyle = accent
  ctx.fillText(model.pnlText, x, 440)

  ctx.font = `600 28px ${FONT}`
  ctx.fillStyle = '#e4e4e7'
  ctx.fillText(model.headline, x, 500)

  // Metrics as hairline columns
  const midY = 560
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.moveTo(x, midY)
  ctx.lineTo(SHARE_W - 88, midY)
  ctx.stroke()

  const cols = model.rows.slice(0, 6)
  const colW = (SHARE_W - 88 - x) / cols.length
  cols.forEach((row, i) => {
    const cx = x + i * colW
    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.beginPath()
      ctx.moveTo(cx, midY + 24)
      ctx.lineTo(cx, midY + 110)
      ctx.stroke()
    }
    ctx.font = `500 11px ${FONT}`
    ctx.fillStyle = '#52525b'
    ctx.letterSpacing = '0.16em'
    ctx.fillText(row.label.toUpperCase(), cx + (i > 0 ? 20 : 0), midY + 48)
    ctx.letterSpacing = '0px'
    ctx.font = `600 22px ${FONT}`
    ctx.fillStyle = toneColor(row.tone, true)
    ctx.fillText(truncate(row.value, 12), cx + (i > 0 ? 20 : 0), midY + 88)
  })

  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.moveTo(x, midY + 130)
  ctx.lineTo(SHARE_W - 88, midY + 130)
  ctx.stroke()

  ctx.font = `500 14px ${FONT}`
  ctx.fillStyle = '#3f3f46'
  ctx.fillText(t(getAppLocale(), 'share.tagline'), x, 840)

  ctx.textAlign = 'right'
  ctx.font = `500 12px ${FONT}`
  ctx.fillStyle = '#27272a'
  ctx.fillText('atrium.journal', SHARE_W - 88, 840)
  ctx.textAlign = 'left'

  void positive
}

// ─── Theme: Signal (split accent panel) ─────────────────────────────────────

function renderSignal(ctx: CanvasRenderingContext2D, model: ShareModel, logo: HTMLImageElement | null) {
  const positive = model.pnl >= 0
  const accent = model.pnl > 0 ? '#22c55e' : model.pnl < 0 ? '#ef4444' : '#71717a'
  const splitX = 980

  ctx.fillStyle = '#09090b'
  ctx.fillRect(0, 0, splitX, SHARE_H)

  // Right panel
  ctx.fillStyle = accent
  ctx.fillRect(splitX, 0, SHARE_W - splitX, SHARE_H)

  // Soft diagonal sheen on accent
  const sheen = ctx.createLinearGradient(splitX, 0, SHARE_W, SHARE_H)
  sheen.addColorStop(0, 'rgba(255,255,255,0.12)')
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.12)')
  ctx.fillStyle = sheen
  ctx.fillRect(splitX, 0, SHARE_W - splitX, SHARE_H)

  const x = 72
  drawBrandHeader(ctx, logo, model, x, 56, { rightLabel: '' })

  ctx.font = `500 15px ${FONT}`
  ctx.fillStyle = '#71717a'
  ctx.letterSpacing = '0.22em'
  ctx.fillText(model.kicker.toUpperCase(), x, 180)
  ctx.letterSpacing = '0px'

  ctx.font = `600 52px ${FONT}`
  ctx.fillStyle = '#fafafa'
  ctx.fillText(truncate(model.traderName, 20), x, 250)

  ctx.font = `500 17px ${FONT}`
  ctx.fillStyle = '#52525b'
  ctx.fillText(model.meta, x, 290)

  // Metric stack
  let my = 360
  model.rows.slice(0, 6).forEach((row) => {
    ctx.font = `500 12px ${FONT}`
    ctx.fillStyle = '#52525b'
    ctx.letterSpacing = '0.12em'
    ctx.fillText(row.label.toUpperCase(), x, my)
    ctx.letterSpacing = '0px'

    ctx.font = `600 26px ${FONT}`
    ctx.fillStyle = toneColor(row.tone, true)
    ctx.fillText(truncate(row.value, 18), x + 280, my)

    my += 52
  })

  ctx.font = `600 26px ${FONT}`
  ctx.fillStyle = '#e4e4e7'
  ctx.fillText(model.headline, x, 820)

  ctx.font = `500 13px ${FONT}`
  ctx.fillStyle = '#3f3f46'
  ctx.fillText(t(getAppLocale(), 'share.tagline'), x, 856)

  // Right panel content
  const rx = splitX + 48
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  roundRect(ctx, rx, 72, SHARE_W - splitX - 96, 40, 20)
  ctx.fill()

  ctx.font = `600 13px ${FONT}`
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.letterSpacing = '0.24em'
  ctx.fillText('P&L', rx + 22, 98)
  ctx.letterSpacing = '0px'

  // Huge P&L rotated feel via wrapping
  ctx.save()
  ctx.font = `700 72px ${FONT}`
  ctx.fillStyle = '#09090b'
  const pnlLines = wrapText(ctx, model.pnlText, SHARE_W - splitX - 100)
  let py = 320
  for (const line of pnlLines) {
    ctx.fillText(line, rx, py)
    py += 82
  }
  ctx.restore()

  ctx.font = `600 18px ${FONT}`
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillText(truncate(model.accountName, 22), rx, 780)

  ctx.font = `500 13px ${FONT}`
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillText('atrium.journal', rx, 820)

  void positive
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  if (ctx.measureText(text).width <= maxW) return [text]
  // Split after currency / sign if possible
  const m = text.match(/^([+\-−]?[^\d]*)(.*)$/)
  if (m && m[2] && ctx.measureText(m[2]).width <= maxW) {
    return [m[1].trim() || text.slice(0, 1), m[2]]
  }
  const mid = Math.ceil(text.length / 2)
  return [text.slice(0, mid), text.slice(mid)]
}

// ─── Theme: Folio (light premium) ───────────────────────────────────────────

function renderFolio(ctx: CanvasRenderingContext2D, model: ShareModel, logo: HTMLImageElement | null) {
  const positive = model.pnl >= 0
  const accent = model.pnl > 0 ? '#16a34a' : model.pnl < 0 ? '#dc2626' : '#52525b'

  // Cool zinc paper, not warm cream
  ctx.fillStyle = '#f4f4f5'
  ctx.fillRect(0, 0, SHARE_W, SHARE_H)

  // Soft mesh
  const mesh = ctx.createRadialGradient(1280, 160, 40, 1280, 160, 520)
  mesh.addColorStop(0, positive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)')
  mesh.addColorStop(1, 'rgba(244,244,245,0)')
  ctx.fillStyle = mesh
  ctx.fillRect(900, 0, 700, 700)

  const mesh2 = ctx.createRadialGradient(200, 700, 20, 200, 700, 400)
  mesh2.addColorStop(0, 'rgba(24,24,27,0.04)')
  mesh2.addColorStop(1, 'rgba(244,244,245,0)')
  ctx.fillStyle = mesh2
  ctx.fillRect(0, 400, 600, 500)

  // Top accent line
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, SHARE_W, 4)

  const x = 88
  drawBrandHeader(ctx, logo, model, x, 64, { light: true })

  // Identity block on a white panel
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, x, 160, 720, 200, 20)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 1
  roundRect(ctx, x + 0.5, 160.5, 719, 199, 20)
  ctx.stroke()

  ctx.font = `500 14px ${FONT}`
  ctx.fillStyle = '#71717a'
  ctx.letterSpacing = '0.18em'
  ctx.fillText(model.kicker.toUpperCase(), x + 36, 210)
  ctx.letterSpacing = '0px'

  ctx.font = `600 40px ${FONT}`
  ctx.fillStyle = '#18181b'
  ctx.fillText(truncate(model.traderName, 24), x + 36, 268)

  ctx.font = `500 15px ${FONT}`
  ctx.fillStyle = '#a1a1aa'
  ctx.fillText(model.meta, x + 36, 308)

  // P&L card
  ctx.fillStyle = accent
  roundRect(ctx, 860, 160, 652, 200, 20)
  ctx.fill()

  ctx.font = `600 13px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.letterSpacing = '0.22em'
  ctx.fillText('P&L', 900, 220)
  ctx.letterSpacing = '0px'

  ctx.font = `700 64px ${FONT}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(truncate(model.pnlText, 14), 900, 300)

  // Metrics grid
  const tileW = 340
  const tileH = 100
  const gapX = 24
  const gapY = 20
  const startY = 400
  model.rows.slice(0, 6).forEach((row, i) => {
    const col = i % 3
    const rowi = Math.floor(i / 3)
    const rx = x + col * (tileW + gapX)
    const ry = startY + rowi * (tileH + gapY)

    ctx.fillStyle = '#ffffff'
    roundRect(ctx, rx, ry, tileW, tileH, 16)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'
    ctx.lineWidth = 1
    roundRect(ctx, rx + 0.5, ry + 0.5, tileW - 1, tileH - 1, 16)
    ctx.stroke()

    ctx.font = `500 11px ${FONT}`
    ctx.fillStyle = '#a1a1aa'
    ctx.letterSpacing = '0.14em'
    ctx.fillText(row.label.toUpperCase(), rx + 24, ry + 36)
    ctx.letterSpacing = '0px'

    ctx.font = `600 26px ${FONT}`
    ctx.fillStyle = row.tone === 'up' ? '#16a34a' : row.tone === 'down' ? '#dc2626' : '#18181b'
    ctx.fillText(truncate(row.value, 16), rx + 24, ry + 72)
  })

  ctx.font = `600 28px ${FONT}`
  ctx.fillStyle = '#18181b'
  ctx.fillText(model.headline, x, 700)

  ctx.font = `500 14px ${FONT}`
  ctx.fillStyle = '#a1a1aa'
  ctx.fillText(t(getAppLocale(), 'share.tagline'), x, 740)

  ctx.textAlign = 'right'
  ctx.font = `500 12px ${FONT}`
  ctx.fillStyle = '#d4d4d8'
  ctx.fillText('atrium.journal', SHARE_W - 72, 740)
  ctx.textAlign = 'left'
}

export function renderShareCard(
  canvas: HTMLCanvasElement,
  model: ShareModel,
  logo: HTMLImageElement | null,
  theme: ShareTheme = 'orbit',
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = SHARE_W
  canvas.height = SHARE_H

  // Reset letterSpacing in case previous draw left it set
  ctx.letterSpacing = '0px'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  switch (theme) {
    case 'editorial':
      renderEditorial(ctx, model, logo)
      break
    case 'signal':
      renderSignal(ctx, model, logo)
      break
    case 'folio':
      renderFolio(ctx, model, logo)
      break
    case 'orbit':
    default:
      renderOrbit(ctx, model, logo)
      break
  }
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error(t(getAppLocale(), 'share.genFail')))
      else resolve(blob)
    }, 'image/png')
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
