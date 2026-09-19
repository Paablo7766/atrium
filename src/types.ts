export type Direction = 'LONG' | 'SHORT' | 'NONE'

export const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'NONE', label: '—' },
  { value: 'LONG', label: 'Long' },
  { value: 'SHORT', label: 'Corto' },
]

export function parseDirection(raw?: string | null): Direction {
  const v = (raw ?? '').trim().toUpperCase()
  if (!v || ['NONE', 'N/A', 'NA', '-', 'SPOT', 'SIMPLE', 'CASH'].includes(v)) return 'NONE'
  if (v === 'SHORT' || v === 'SELL' || v === 'CORTO' || v === 'VENTA' || v === 'S') return 'SHORT'
  if (v === 'LONG' || v === 'BUY' || v === 'COMPRA' || v === 'LARGO' || v === 'L') return 'LONG'
  if (v.startsWith('SHORT') || v.startsWith('SELL')) return 'SHORT'
  if (v.startsWith('LONG') || v.startsWith('BUY')) return 'LONG'
  return 'NONE'
}

export type TradeStatus = 'OPEN' | 'CLOSED'
export type TradeFormMode = 'simple' | 'premium'
export type Market = 'Forex' | 'Índices' | 'Futuros' | 'Acciones' | 'Crypto' | 'Materias primas' | 'Opciones' | 'Otros'
export type Currency = 'USD' | 'EUR' | 'GBP'
export type AccountType = 'live' | 'demo' | 'prop' | 'paper'
export type AccountColor = 'green' | 'sky' | 'violet' | 'amber' | 'rose'
export type WeekStart = 0 | 1
export type AppLocale = 'es' | 'en'

export const MARKETS: Market[] = ['Forex', 'Índices', 'Futuros', 'Acciones', 'Crypto', 'Materias primas', 'Opciones', 'Otros']
export const EMOTIONS = ['Disciplinado', 'Confiado', 'Neutral', 'Ansioso', 'FOMO', 'Venganza', 'Aburrido', 'Cansado'] as const
export type Emotion = (typeof EMOTIONS)[number]

export const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string }[] = [
  { value: 'live', label: 'Real', hint: 'Dinero real' },
  { value: 'demo', label: 'Demo', hint: 'Cuenta de práctica del bróker' },
  { value: 'prop', label: 'Prop firm', hint: 'Challenge o fondeada' },
  { value: 'paper', label: 'Simulada', hint: 'Paper trading / backtest' },
]

export const ACCOUNT_COLORS: { value: AccountColor; swatch: string }[] = [
  { value: 'green', swatch: '#4ade80' },
  { value: 'sky', swatch: '#38bdf8' },
  { value: 'violet', swatch: '#a78bfa' },
  { value: 'amber', swatch: '#fbbf24' },
  { value: 'rose', swatch: '#fb7185' },
]

export const DEFAULT_ACCOUNT_ID = 'account-main'

export type CashflowKind = 'deposit' | 'withdrawal'

export interface Cashflow {
  id: string
  date: string // ISO
  kind: CashflowKind
  amount: number
  note: string
}

export interface PlaybookItem {
  id: string
  label: string
}

export interface PlaybookSetup {
  id: string
  name: string
  notes: string
  checklist: PlaybookItem[]
  createdAt: string
  updatedAt: string
}

export const DEFAULT_MISTAKES = [
  'Sin plan',
  'Stop movido',
  'Sobreoperar',
  'Revenge',
  'FOMO',
  'Size excesivo',
  'Salida temprana',
  'Sin stop',
] as const

export interface Trade {
  id: string
  symbol: string
  market: Market
  direction: Direction
  status: TradeStatus
  entryDate: string // ISO
  exitDate?: string // ISO
  entryPrice: number
  exitPrice?: number
  quantity: number
  multiplier: number // valor por punto / tamaño de contrato
  fees: number
  stopLoss?: number
  takeProfit?: number
  strategy: string
  tags: string[]
  notes: string
  rating: number // 1..5, 0 = sin valorar
  emotion?: Emotion
  pnlOverride?: number // P&L manual (opcional)
  setupId?: string
  checklistDone?: string[]
  mistakes?: string[]
  createdAt: string
  updatedAt: string
}

export interface JournalEntry {
  id: string
  date: string // YYYY-MM-DD
  mood: number // 1..5
  title: string
  content: string
  updatedAt: string
}

export interface AccountBook {
  id: string
  name: string
  broker: string
  type: AccountType
  color: AccountColor
  currency: Currency
  startingBalance: number
  riskPerTrade: number
  dailyLossLimit: number
  createdAt: string
  trades: Trade[]
  notes: JournalEntry[]
  cashflows: Cashflow[]
}

export interface Settings {
  traderName: string
  avatar?: string
  tradeFormMode: TradeFormMode
  activeAccountId: string
  accountName: string
  currency: Currency
  startingBalance: number
  riskPerTrade: number
  dailyLossLimit: number
  defaultMarket: Market
  preferredMarkets: Market[]
  defaultFees: number
  weekStartsOn: WeekStart
  onboardingCompleted: boolean
  tutorialCompleted: boolean
  playbook: PlaybookSetup[]
  demoData?: boolean
  locale: AppLocale
  /** Sync E2E opcional con Supabase (activado explícitamente por el usuario). */
  cloudSyncEnabled?: boolean
  /** ISO timestamp de la última sync cloud exitosa. */
  lastCloudSyncAt?: string
}

export interface PersistedData {
  version: 1 | 2
  trades?: Trade[]
  notes?: JournalEntry[]
  settings: Settings
  accounts?: AccountBook[]
}

export const DEFAULT_SETTINGS: Settings = {
  traderName: 'Trader',
  tradeFormMode: 'simple',
  activeAccountId: DEFAULT_ACCOUNT_ID,
  accountName: 'Cuenta principal',
  currency: 'USD',
  startingBalance: 10000,
  riskPerTrade: 1,
  dailyLossLimit: 0,
  defaultMarket: 'Futuros',
  preferredMarkets: ['Futuros'],
  defaultFees: 0,
  weekStartsOn: 1,
  onboardingCompleted: false,
  tutorialCompleted: false,
  playbook: [],
  locale: 'es',
}

export const COLOR_BY_ACCOUNT_TYPE: Record<AccountType, AccountColor> = {
  live: 'green',
  demo: 'sky',
  prop: 'violet',
  paper: 'amber',
}

export function normalizePreferredMarkets(raw: unknown, fallback: Market = DEFAULT_SETTINGS.defaultMarket): Market[] {
  const listed = Array.isArray(raw) ? raw.filter((m): m is Market => MARKETS.includes(m as Market)) : []
  const unique = [...new Set(listed)]
  if (unique.length) return unique
  return MARKETS.includes(fallback) ? [fallback] : [DEFAULT_SETTINGS.defaultMarket]
}

export function togglePreferredMarket(current: Market[], market: Market): Market[] {
  if (current.includes(market)) {
    const next = current.filter((m) => m !== market)
    return next.length ? next : current
  }
  return [...current, market]
}

export function orderedMarketOptions(preferred: Market[] = []): Market[] {
  const pref = preferred.filter((m) => MARKETS.includes(m))
  const rest = MARKETS.filter((m) => !pref.includes(m))
  return pref.length ? [...pref, ...rest] : [...MARKETS]
}

export function defaultFeesForMarket(market: Market): number {
  switch (market) {
    case 'Futuros':
      return 4.2
    case 'Índices':
      return 2
    case 'Acciones':
      return 1
    case 'Crypto':
      return 5
    case 'Materias primas':
      return 4
    case 'Opciones':
      return 2.5
    default:
      return 0
  }
}

export function accountFromSettings(settings: Settings, trades: Trade[] = [], notes: JournalEntry[] = []): AccountBook {
  return {
    id: settings.activeAccountId || DEFAULT_ACCOUNT_ID,
    name: settings.accountName || 'Cuenta principal',
    broker: '',
    type: 'live',
    color: 'green',
    currency: settings.currency,
    startingBalance: settings.startingBalance,
    riskPerTrade: settings.riskPerTrade,
    dailyLossLimit: settings.dailyLossLimit,
    createdAt: new Date().toISOString(),
    trades,
    notes,
    cashflows: [],
  }
}

export function settingsFromAccount(settings: Settings, account: AccountBook): Settings {
  return {
    ...settings,
    activeAccountId: account.id,
    accountName: account.name,
    currency: account.currency,
    startingBalance: account.startingBalance,
    riskPerTrade: account.riskPerTrade,
    dailyLossLimit: account.dailyLossLimit,
  }
}
