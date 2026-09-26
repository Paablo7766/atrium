import {
  ACCOUNT_COLORS,
  ACCOUNT_TYPES,
  DEFAULT_ACCOUNT_ID,
  DEFAULT_SETTINGS,
  EMOTIONS,
  MARKETS,
  normalizePreferredMarkets,
  parseDirection,
  type AccountBook,
  type AccountColor,
  type AccountType,
  type AppLocale,
  type Cashflow,
  type Currency,
  type Emotion,
  type JournalEntry,
  type Market,
  type PersistedData,
  type PlaybookItem,
  type PlaybookSetup,
  type Settings,
  type Trade,
  type TradeFormMode,
  type TradeStatus,
  type WeekStart,
} from '@/types'
import { sanitizeAvatar } from '@/lib/avatar'
import { getAppLocale, t } from '@/lib/i18n'

export type JournalParseOk = {
  ok: true
  data: PersistedData
  skippedTrades: number
  skippedNotes: number
}

export type JournalParseFail = { ok: false; error: string }

export type JournalParseResult = JournalParseOk | JournalParseFail

const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP']
const FORM_MODES: TradeFormMode[] = ['simple', 'premium']
const LOCALES: AppLocale[] = ['es', 'en']
const STATUSES: TradeStatus[] = ['OPEN', 'CLOSED']

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function optNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = num(v, Number.NaN)
  return Number.isFinite(n) ? n : undefined
}

function looksLikeJournal(raw: unknown): boolean {
  if (!isObj(raw)) return false
  if (isObj(raw.settings)) return true
  if (Array.isArray(raw.accounts)) return true
  if (Array.isArray(raw.trades)) return true
  if (Array.isArray(raw.notes)) return true
  return false
}

function asMarket(v: unknown): Market {
  return MARKETS.includes(v as Market) ? (v as Market) : DEFAULT_SETTINGS.defaultMarket
}

function asCurrency(v: unknown): Currency {
  return CURRENCIES.includes(v as Currency) ? (v as Currency) : DEFAULT_SETTINGS.currency
}

function asAccountType(v: unknown): AccountType {
  return ACCOUNT_TYPES.some((t) => t.value === v) ? (v as AccountType) : 'live'
}

function asAccountColor(v: unknown): AccountColor {
  return ACCOUNT_COLORS.some((c) => c.value === v) ? (v as AccountColor) : 'green'
}

function asEmotion(v: unknown): Emotion | undefined {
  return EMOTIONS.includes(v as Emotion) ? (v as Emotion) : undefined
}

function sanitizeTrade(raw: unknown): Trade | null {
  if (!isObj(raw)) return null
  const id = str(raw.id).trim()
  const symbol = str(raw.symbol).trim()
  const entryDate = str(raw.entryDate).trim()
  if (!id || !symbol || !entryDate) return null
  const statusRaw = str(raw.status).toUpperCase()
  const status: TradeStatus = STATUSES.includes(statusRaw as TradeStatus) ? (statusRaw as TradeStatus) : 'CLOSED'
  const tags = Array.isArray(raw.tags) ? raw.tags.map((t) => str(t).trim()).filter(Boolean) : []
  const rating = Math.max(0, Math.min(5, Math.round(num(raw.rating, 0))))
  const createdAt = str(raw.createdAt, entryDate)
  const updatedAt = str(raw.updatedAt, createdAt)
  const trade: Trade = {
    id,
    symbol,
    market: asMarket(raw.market),
    direction: parseDirection(str(raw.direction)),
    status,
    entryDate,
    entryPrice: num(raw.entryPrice, 0),
    quantity: num(raw.quantity, 1),
    multiplier: num(raw.multiplier, 1) || 1,
    fees: num(raw.fees, 0),
    strategy: str(raw.strategy),
    tags,
    notes: str(raw.notes),
    rating,
    createdAt,
    updatedAt,
  }
  const exitDate = str(raw.exitDate).trim()
  if (exitDate) trade.exitDate = exitDate
  const exitPrice = optNum(raw.exitPrice)
  if (exitPrice !== undefined) trade.exitPrice = exitPrice
  const stopLoss = optNum(raw.stopLoss)
  if (stopLoss !== undefined) trade.stopLoss = stopLoss
  const takeProfit = optNum(raw.takeProfit)
  if (takeProfit !== undefined) trade.takeProfit = takeProfit
  const emotion = asEmotion(raw.emotion)
  if (emotion) trade.emotion = emotion
  if (raw.pnlOverride !== undefined && raw.pnlOverride !== null && raw.pnlOverride !== '') {
    const p = optNum(raw.pnlOverride)
    if (p !== undefined) trade.pnlOverride = p
  }
  const setupId = str(raw.setupId).trim()
  if (setupId) trade.setupId = setupId
  if (Array.isArray(raw.checklistDone)) {
    trade.checklistDone = raw.checklistDone.map((x) => str(x).trim()).filter(Boolean)
  }
  if (Array.isArray(raw.mistakes)) {
    trade.mistakes = raw.mistakes.map((x) => str(x).trim()).filter(Boolean)
  }
  return trade
}

function sanitizeCashflow(raw: unknown): Cashflow | null {
  if (!isObj(raw)) return null
  const id = str(raw.id).trim()
  const date = str(raw.date).trim()
  const kind = str(raw.kind) === 'withdrawal' ? 'withdrawal' : str(raw.kind) === 'deposit' ? 'deposit' : null
  const amount = Math.abs(num(raw.amount, 0))
  if (!id || !date || !kind || !(amount > 0)) return null
  return { id, date, kind, amount, note: str(raw.note) }
}

function sanitizeSetup(raw: unknown): PlaybookSetup | null {
  if (!isObj(raw)) return null
  const id = str(raw.id).trim()
  const name = str(raw.name).trim()
  if (!id || !name) return null
  const checklist: PlaybookItem[] = Array.isArray(raw.checklist)
    ? raw.checklist.flatMap((item) => {
        if (!isObj(item)) return []
        const cid = str(item.id).trim() || str(item.label).trim()
        const label = str(item.label).trim()
        if (!cid || !label) return []
        return [{ id: cid, label }]
      })
    : []
  return {
    id,
    name,
    notes: str(raw.notes),
    checklist,
    createdAt: str(raw.createdAt, new Date().toISOString()),
    updatedAt: str(raw.updatedAt, new Date().toISOString()),
  }
}

function sanitizeNote(raw: unknown): JournalEntry | null {
  if (!isObj(raw)) return null
  const id = str(raw.id).trim()
  const date = str(raw.date).trim()
  if (!id || !date) return null
  const mood = Math.max(1, Math.min(5, Math.round(num(raw.mood, 3))))
  return {
    id,
    date,
    mood,
    title: str(raw.title),
    content: str(raw.content),
    updatedAt: str(raw.updatedAt, new Date().toISOString()),
  }
}

function sanitizeAccount(raw: unknown): { account: AccountBook; skippedTrades: number; skippedNotes: number } | null {
  if (!isObj(raw)) return null
  const id = str(raw.id).trim() || DEFAULT_ACCOUNT_ID
  const name = str(raw.name).trim() || 'Cuenta principal'
  const tradeRaw = Array.isArray(raw.trades) ? raw.trades : []
  const noteRaw = Array.isArray(raw.notes) ? raw.notes : []
  const trades: Trade[] = []
  let skippedTrades = 0
  for (const t of tradeRaw) {
    const s = sanitizeTrade(t)
    if (s) trades.push(s)
    else skippedTrades += 1
  }
  const notes: JournalEntry[] = []
  let skippedNotes = 0
  for (const n of noteRaw) {
    const s = sanitizeNote(n)
    if (s) notes.push(s)
    else skippedNotes += 1
  }
  const cashflows = Array.isArray(raw.cashflows) ? raw.cashflows.flatMap((c) => {
    const s = sanitizeCashflow(c)
    return s ? [s] : []
  }) : []
  return {
    skippedTrades,
    skippedNotes,
    account: {
      id,
      name,
      broker: str(raw.broker),
      type: asAccountType(raw.type),
      color: asAccountColor(raw.color),
      currency: asCurrency(raw.currency),
      startingBalance: num(raw.startingBalance, DEFAULT_SETTINGS.startingBalance),
      riskPerTrade: num(raw.riskPerTrade, DEFAULT_SETTINGS.riskPerTrade),
      dailyLossLimit: num(raw.dailyLossLimit, 0),
      createdAt: str(raw.createdAt, new Date().toISOString()),
      trades,
      notes,
      cashflows,
    },
  }
}

function sanitizeSettings(raw: unknown): Settings {
  const src = isObj(raw) ? raw : {}
  const formMode = str(src.tradeFormMode)
  const week = num(src.weekStartsOn, DEFAULT_SETTINGS.weekStartsOn)
  const defaultMarketRaw = asMarket(src.defaultMarket)
  const preferred = normalizePreferredMarkets(src.preferredMarkets, defaultMarketRaw)
  const preferredMarkets = preferred.includes(defaultMarketRaw) ? preferred : [defaultMarketRaw, ...preferred]
  return {
    ...DEFAULT_SETTINGS,
    traderName: str(src.traderName, DEFAULT_SETTINGS.traderName) || DEFAULT_SETTINGS.traderName,
    avatar: sanitizeAvatar(src.avatar),
    tradeFormMode:
      formMode === 'pro'
        ? 'premium'
        : FORM_MODES.includes(formMode as TradeFormMode)
          ? (formMode as TradeFormMode)
          : DEFAULT_SETTINGS.tradeFormMode,
    activeAccountId: str(src.activeAccountId, DEFAULT_SETTINGS.activeAccountId) || DEFAULT_SETTINGS.activeAccountId,
    accountName: str(src.accountName, DEFAULT_SETTINGS.accountName) || DEFAULT_SETTINGS.accountName,
    currency: asCurrency(src.currency),
    startingBalance: num(src.startingBalance, DEFAULT_SETTINGS.startingBalance),
    riskPerTrade: num(src.riskPerTrade, DEFAULT_SETTINGS.riskPerTrade),
    dailyLossLimit: num(src.dailyLossLimit, 0),
    preferredMarkets,
    defaultMarket: preferredMarkets.includes(defaultMarketRaw) ? defaultMarketRaw : preferredMarkets[0],
    defaultFees: num(src.defaultFees, 0),
    weekStartsOn: (week === 0 ? 0 : 1) as WeekStart,
    onboardingCompleted: src.onboardingCompleted === undefined ? DEFAULT_SETTINGS.onboardingCompleted : !!src.onboardingCompleted,
    tutorialCompleted: !!src.tutorialCompleted,
    demoData: !!src.demoData,
    playbook: Array.isArray(src.playbook) ? src.playbook.flatMap((p) => {
      const s = sanitizeSetup(p)
      return s ? [s] : []
    }) : [],
    locale: LOCALES.includes(src.locale as AppLocale) ? (src.locale as AppLocale) : DEFAULT_SETTINGS.locale,
    lastSeenAppVersion: typeof src.lastSeenAppVersion === 'string' && src.lastSeenAppVersion.trim()
      ? src.lastSeenAppVersion.trim()
      : undefined,
  }
}

export function parseJournalFile(raw: unknown): JournalParseResult {
  if (!looksLikeJournal(raw)) {
    return { ok: false, error: t(getAppLocale(), 'err.notAtrium') }
  }
  const obj = raw as Record<string, unknown>
  let skippedTrades = 0
  let skippedNotes = 0
  const settings = sanitizeSettings(obj.settings)

  let accounts: AccountBook[] | undefined
  if (Array.isArray(obj.accounts)) {
    accounts = []
    for (const item of obj.accounts) {
      const s = sanitizeAccount(item)
      if (!s) continue
      accounts.push(s.account)
      skippedTrades += s.skippedTrades
      skippedNotes += s.skippedNotes
    }
  }

  let trades: Trade[] | undefined
  if (Array.isArray(obj.trades)) {
    trades = []
    for (const t of obj.trades) {
      const s = sanitizeTrade(t)
      if (s) trades.push(s)
      else skippedTrades += 1
    }
  }

  let notes: JournalEntry[] | undefined
  if (Array.isArray(obj.notes)) {
    notes = []
    for (const n of obj.notes) {
      const s = sanitizeNote(n)
      if (s) notes.push(s)
      else skippedNotes += 1
    }
  }

  const hasBooks = !!accounts?.length
  const hasFlat = (trades?.length ?? 0) > 0 || (notes?.length ?? 0) > 0
  if (!hasBooks && !hasFlat && !isObj(obj.settings) && !Array.isArray(obj.accounts) && !Array.isArray(obj.trades)) {
    return { ok: false, error: 'El archivo no contiene un diario reconocible.' }
  }

  const version = obj.version === 2 || hasBooks ? 2 : 1
  const data: PersistedData = {
    version,
    settings,
    ...(accounts ? { accounts } : {}),
    ...(trades ? { trades } : {}),
    ...(notes ? { notes } : {}),
  }
  return { ok: true, data, skippedTrades, skippedNotes }
}

export function parseJournalText(text: string): JournalParseResult {
  try {
    return parseJournalFile(JSON.parse(text) as unknown)
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido.' }
  }
}
