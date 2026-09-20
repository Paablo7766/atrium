import { create } from 'zustand'
import type {
  Trade,
  JournalEntry,
  Settings,
  PersistedData,
  AccountBook,
  AccountType,
  AccountColor,
  Currency,
  Market,
  TradeFormMode,
  WeekStart,
  Cashflow,
  PlaybookSetup,
} from '@/types'
import {
  DEFAULT_ACCOUNT_ID,
  DEFAULT_SETTINGS,
  accountFromSettings,
  parseDirection,
  settingsFromAccount,
} from '@/types'
import { isDesktop, loadData, saveData, saveDataSync, parseJournalFile, wipeLocalStorage } from '@/lib/db/client'
import { writeCloudSyncPref } from '@/lib/cloudSyncPref'
import {
  bumpLocalMutationClock,
  computeJournalMutationAt,
  isCloudSyncActive,
  pushLocalJournalToCloud,
  syncJournalWithCloud,
} from '@/lib/tradeSync'
import { tradeFingerprint } from '@/lib/csv'
import { uid } from '@/lib/format'
import { generateDemoTrades, generateDemoNotes } from '@/lib/demo'
import { ensureLocale, getAppLocale, setAppLocale, t } from '@/lib/i18n'
import { RANGE_OPTIONS, type Range } from '@/lib/range'
import type { ShareTarget } from '@/lib/shareCard'

export type Page = 'dashboard' | 'trades' | 'calendar' | 'analytics' | 'journal' | 'settings'

export type Toast = { id: string; message: string; kind?: 'success' | 'error' | 'info' }

export type NewAccountInput = {
  name: string
  broker?: string
  type?: AccountType
  color?: AccountColor
  currency?: Currency
  startingBalance?: number
  riskPerTrade?: number
  dailyLossLimit?: number
}

export type OnboardingPayload = {
  traderName: string
  accountName: string
  broker: string
  type: AccountType
  color: AccountColor
  currency: Currency
  startingBalance: number
  riskPerTrade: number
  dailyLossLimit: number
  defaultMarket: Market
  preferredMarkets: Market[]
  defaultFees: number
  weekStartsOn: WeekStart
  tradeFormMode: TradeFormMode
  loadDemo: boolean
  clearHistory: boolean
}

interface State {
  loaded: boolean
  trades: Trade[]
  notes: JournalEntry[]
  settings: Settings
  accounts: AccountBook[]
  page: Page
  tradesQuery: string
  statsRange: Range
  sidebarCollapsed: boolean
  toasts: Toast[]
  tutorialActive: boolean
  loadError: string | null
  dbLocked: boolean
  cashflows: Cashflow[]

  tradeModal: { open: boolean; trade?: Trade; presetDate?: string }
  shareTarget: ShareTarget | null

  init: () => Promise<void>
  unlockDatabase: () => Promise<void>
  retryLoad: () => Promise<void>
  discardCorruptFile: () => void
  setPage: (p: Page) => void
  setTradesQuery: (q: string) => void
  setStatsRange: (r: Range) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void

  addTrade: (t: Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>) => Trade
  updateTrade: (id: string, patch: Partial<Trade>) => void
  deleteTrade: (id: string) => void
  duplicateTrade: (id: string) => void

  upsertNote: (n: Omit<JournalEntry, 'id' | 'updatedAt'> & { id?: string }) => JournalEntry
  deleteNote: (id: string) => void

  updateSettings: (patch: Partial<Settings>) => void

  switchAccount: (id: string) => void
  createAccount: (input: NewAccountInput) => string
  updateAccount: (id: string, patch: Partial<Omit<AccountBook, 'id' | 'trades' | 'notes'>>) => void
  deleteAccount: (id: string) => boolean
  duplicateAccount: (id: string) => string | null

  addCashflow: (input: { kind: Cashflow['kind']; amount: number; date: string; note?: string }) => void
  deleteCashflow: (id: string) => void
  upsertSetup: (input: { id?: string; name: string; notes?: string; checklist: { id?: string; label: string }[] }) => void
  deleteSetup: (id: string) => void

  openTradeModal: (trade?: Trade, presetDate?: string) => void
  closeTradeModal: () => void
  openShareCard: (target: ShareTarget) => void
  closeShareCard: () => void

  importData: (
    raw: unknown,
    mode: 'replace' | 'merge',
  ) => { ok: true; skippedTrades: number; skippedNotes: number } | { ok: false; error: string }
  loadDemo: () => void
  clearAll: () => void
  completeOnboarding: (payload: OnboardingPayload) => void
  startTutorial: () => void
  finishTutorial: () => void

  toast: (message: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let persistFailNotified = false

function persistNow(get: () => State, sync = false) {
  if (get().loadError) return
  const { settings, accounts } = snapshot(get())
  const payload = { version: 2 as const, settings, accounts, trades: [] as Trade[], notes: [] as JournalEntry[] }
  const fail = (e: unknown) => {
    if (persistFailNotified) return
    persistFailNotified = true
    get().toast(e instanceof Error ? e.message : t(getAppLocale(), 'err.saveFail'), 'error')
  }
  if (sync && isDesktop()) {
    try {
      saveDataSync(payload)
      persistFailNotified = false
      bumpLocalMutationClock(computeJournalMutationAt(payload))
      if (isCloudSyncActive()) {
        void pushLocalJournalToCloud(payload).catch((e) => {
          console.warn('[store] cloud push:', e instanceof Error ? e.message : e)
        })
      }
    } catch (e) {
      fail(e)
    }
    return
  }
  void saveData(payload)
    .then(() => {
      persistFailNotified = false
      bumpLocalMutationClock(computeJournalMutationAt(payload))
      if (isCloudSyncActive()) {
        void pushLocalJournalToCloud(payload).catch((e) => {
          console.warn('[store] cloud push:', e instanceof Error ? e.message : e)
        })
      }
    })
    .catch(fail)
}

export function flushPersist() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  persistNow(() => useStore.getState(), true)
}

function normalizeTrade(t: Trade): Trade {
  return { ...t, direction: parseDirection(t.direction) }
}

function normalizeAccount(a: AccountBook): AccountBook {
  return {
    ...a,
    broker: a.broker ?? '',
    type: a.type ?? 'live',
    color: a.color ?? 'green',
    trades: (a.trades ?? []).map(normalizeTrade),
    notes: a.notes ?? [],
    cashflows: a.cashflows ?? [],
  }
}

function deskIsUnused(settings: Settings, trades: Trade[], notes: JournalEntry[], cashflows: Cashflow[] = []): boolean {
  const named = Boolean(settings.traderName && settings.traderName !== 'Trader')
  const customAccount = Boolean(settings.accountName && settings.accountName !== 'Cuenta principal')
  return !named && !customAccount && trades.length === 0 && notes.length === 0 && cashflows.length === 0
}

function resolveOnboardingCompleted(data: PersistedData, settings: Settings, trades: Trade[], notes: JournalEntry[], cashflows: Cashflow[] = []): boolean {
  const unused = deskIsUnused(settings, trades, notes, cashflows)
  if (unused) return false
  if (data.settings && 'onboardingCompleted' in data.settings) return !!data.settings.onboardingCompleted
  return true
}

function hydrate(data: PersistedData | null): Pick<State, 'trades' | 'notes' | 'settings' | 'accounts' | 'cashflows'> {
  if (!data) {
    const account = accountFromSettings(DEFAULT_SETTINGS)
    return { trades: [], notes: [], cashflows: [], settings: DEFAULT_SETTINGS, accounts: [account] }
  }

  const merged = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}), playbook: data.settings?.playbook ?? DEFAULT_SETTINGS.playbook }
  const tutorialCompleted = data.settings && 'tutorialCompleted' in data.settings ? !!data.settings.tutorialCompleted : false

  if (data.accounts?.length) {
    const accounts = data.accounts.map(normalizeAccount)
    const active = accounts.find((a) => a.id === merged.activeAccountId) ?? accounts[0]
    const withAccount = settingsFromAccount(merged, active)
    const settings: Settings = {
      ...withAccount,
      playbook: merged.playbook ?? [],
      onboardingCompleted: resolveOnboardingCompleted(
        data,
        withAccount,
        accounts.flatMap((a) => a.trades),
        accounts.flatMap((a) => a.notes),
        accounts.flatMap((a) => a.cashflows ?? []),
      ),
      tutorialCompleted,
    }
    return {
      accounts,
      trades: active.trades,
      notes: active.notes,
      cashflows: active.cashflows ?? [],
      settings,
    }
  }

  const trades = (data.trades ?? []).map(normalizeTrade)
  const notes = data.notes ?? []
  const account = accountFromSettings(merged, trades, notes)
  const settings: Settings = {
    ...merged,
    activeAccountId: account.id,
    playbook: merged.playbook ?? [],
    onboardingCompleted: resolveOnboardingCompleted(data, merged, trades, notes),
    tutorialCompleted,
  }
  return {
    accounts: [account],
    trades,
    notes,
    cashflows: [],
    settings,
  }
}

function mergePlaybook(current: PlaybookSetup[] = [], incoming: PlaybookSetup[] = []): PlaybookSetup[] {
  const byId = new Map(current.map((p) => [p.id, p]))
  for (const p of incoming) {
    if (!byId.has(p.id)) byId.set(p.id, p)
  }
  return [...byId.values()]
}

function snapshot(s: Pick<State, 'trades' | 'notes' | 'settings' | 'accounts' | 'cashflows'>): { settings: Settings; accounts: AccountBook[] } {
  const accounts = s.accounts.map((a) =>
    a.id === s.settings.activeAccountId
      ? {
          ...a,
          name: s.settings.accountName,
          currency: s.settings.currency,
          startingBalance: s.settings.startingBalance,
          riskPerTrade: s.settings.riskPerTrade,
          dailyLossLimit: s.settings.dailyLossLimit,
          trades: s.trades,
          notes: s.notes,
          cashflows: s.cashflows,
        }
      : a,
  )
  return { settings: s.settings, accounts }
}

function schedulePersist(get: () => State) {
  if (get().loadError) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => persistNow(get), 250)
}

const ACCOUNT_FIELDS: (keyof Settings)[] = ['accountName', 'currency', 'startingBalance', 'riskPerTrade', 'dailyLossLimit']
const PAGES: Page[] = ['dashboard', 'trades', 'calendar', 'analytics', 'journal', 'settings']

function readPref(key: string) {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writePref(key: string, value: string) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function storedPage(): Page {
  const v = readPref('atrium.page')
  return v && PAGES.includes(v as Page) ? (v as Page) : 'dashboard'
}

function storedRange(): Range {
  const v = readPref('atrium.range')
  return RANGE_OPTIONS.some((o) => o.value === v) ? (v as Range) : 'all'
}

async function applyCloudSyncAfterLoad(get: () => State): Promise<void> {
  if (!isCloudSyncActive()) return
  const { settings, accounts } = snapshot(get())
  const payload: PersistedData = { version: 2, settings, accounts, trades: [], notes: [] }
  const localAt = computeJournalMutationAt(payload)
  bumpLocalMutationClock(localAt)
  try {
    const result = await syncJournalWithCloud(payload, localAt)
    if (!result.ok) {
      get().toast(result.error, 'error')
      return
    }
    if (result.applied === 'cloud') {
      const hydrated = hydrate(result.data)
      const loc = hydrated.settings.locale ?? 'es'
      await ensureLocale(loc)
      setAppLocale(loc)
      useStore.setState({
        ...hydrated,
        settings: {
          ...hydrated.settings,
          lastCloudSyncAt: new Date(result.at).toISOString(),
        },
      })
      persistNow(get, true)
      return
    }
    if (result.applied === 'local') {
      useStore.setState((s) => ({
        settings: { ...s.settings, lastCloudSyncAt: new Date(result.at).toISOString() },
      }))
    }
  } catch (e) {
    get().toast(e instanceof Error ? e.message : 'Error de sincronización', 'error')
  }
}

function stripSetup(trades: Trade[], setupId: string): Trade[] {
  const now = new Date().toISOString()
  return trades.map((t) => {
    if (t.setupId !== setupId) return t
    const next = { ...t, updatedAt: now }
    delete next.setupId
    delete next.checklistDone
    return next
  })
}

export const useStore = create<State>((set, get) => ({
  loaded: false,
  trades: [],
  notes: [],
  settings: DEFAULT_SETTINGS,
  accounts: [accountFromSettings(DEFAULT_SETTINGS)],
  cashflows: [],
  page: storedPage(),
  tradesQuery: '',
  statsRange: storedRange(),
  sidebarCollapsed: typeof localStorage !== 'undefined' && localStorage.getItem('atrium.sidebar') === '1',
  toasts: [],
  tutorialActive: false,
  loadError: null,
  dbLocked: false,
  tradeModal: { open: false },
  shareTarget: null,

  init: async () => {
    const result = await loadData()
    if (result.status === 'locked') {
      set({ loaded: true, dbLocked: true, loadError: null })
      return
    }
    if (result.status === 'unrecoverable') {
      set({ loaded: true, dbLocked: false, loadError: result.message })
      return
    }
    if (result.status === 'corrupt') {
      set({ loaded: true, dbLocked: false, loadError: result.message })
      return
    }
    const hydrated = result.status === 'empty' ? hydrate(null) : hydrate(result.data)
    const loc = hydrated.settings.locale ?? 'es'
    await ensureLocale(loc)
    setAppLocale(loc)
    set({ ...hydrated, loaded: true, dbLocked: false, loadError: null })
    writeCloudSyncPref(!!hydrated.settings.cloudSyncEnabled)
    if (result.status === 'ok' && (result.skippedTrades || result.skippedNotes)) {
      const loc = getAppLocale()
      const bits = [
        result.skippedTrades ? t(loc, 'err.nTrades', { n: result.skippedTrades }) : '',
        result.skippedNotes ? t(loc, 'err.nNotes', { n: result.skippedNotes }) : '',
      ].filter(Boolean)
      get().toast(t(loc, 'err.skipLoad', { bits: bits.join(t(loc, 'err.and')) }), 'info')
    }
    await applyCloudSyncAfterLoad(get)
  },

  retryLoad: async () => {
    await get().init()
  },

  unlockDatabase: async () => {
    const result = await loadData()
    if (result.status === 'locked') {
      get().toast(t(getAppLocale(), 'crypto.stillLocked'), 'error')
      return
    }
    if (result.status === 'unrecoverable' || result.status === 'corrupt') {
      set({ loaded: true, dbLocked: false, loadError: result.message })
      return
    }
    if (result.status !== 'ok' && result.status !== 'empty') return
    const hydrated = result.status === 'empty' ? hydrate(null) : hydrate(result.data)
    const loc = hydrated.settings.locale ?? 'es'
    await ensureLocale(loc)
    setAppLocale(loc)
    set({ ...hydrated, loaded: true, dbLocked: false, loadError: null })
    writeCloudSyncPref(!!hydrated.settings.cloudSyncEnabled)
    await applyCloudSyncAfterLoad(get)
  },

  discardCorruptFile: () => {
    void (async () => {
      persistFailNotified = false
      await wipeLocalStorage()
      set({ ...hydrate(null), loaded: true, loadError: null, dbLocked: false })
      await get().init()
    })()
  },

  setPage: (page) => {
    writePref('atrium.page', page)
    set({ page })
  },
  setTradesQuery: (tradesQuery) => set({ tradesQuery }),
  setStatsRange: (statsRange) => {
    writePref('atrium.range', statsRange)
    set({ statsRange })
  },
  toggleSidebar: () =>
    set((s) => {
      const sidebarCollapsed = !s.sidebarCollapsed
      try {
        localStorage.setItem('atrium.sidebar', sidebarCollapsed ? '1' : '0')
      } catch {
        /* ignore */
      }
      return { sidebarCollapsed }
    }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    try {
      localStorage.setItem('atrium.sidebar', sidebarCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
    set({ sidebarCollapsed })
  },

  addTrade: (t) => {
    const now = new Date().toISOString()
    const trade: Trade = { ...t, id: uid(), createdAt: now, updatedAt: now }
    set((s) => ({ trades: [trade, ...s.trades] }))
    schedulePersist(get)
    return trade
  },

  updateTrade: (id, patch) => {
    set((s) => ({
      trades: s.trades.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
    }))
    schedulePersist(get)
  },

  deleteTrade: (id) => {
    set((s) => ({ trades: s.trades.filter((t) => t.id !== id) }))
    schedulePersist(get)
  },

  duplicateTrade: (id) => {
    const src = get().trades.find((t) => t.id === id)
    if (!src) return
    const now = new Date().toISOString()
    set((s) => ({ trades: [{ ...src, id: uid(), createdAt: now, updatedAt: now, entryDate: now, exitDate: src.status === 'CLOSED' ? now : undefined }, ...s.trades] }))
    schedulePersist(get)
  },

  upsertNote: (n) => {
    const now = new Date().toISOString()
    let saved: JournalEntry | null = null
    set((s) => {
      const exists = n.id && s.notes.some((x) => x.id === n.id)
      if (exists) {
        const notes = s.notes.map((x) => (x.id === n.id ? { ...x, ...n, id: x.id, updatedAt: now } : x))
        saved = notes.find((x) => x.id === n.id) ?? null
        return { notes }
      }
      saved = { ...n, id: n.id ?? uid(), updatedAt: now }
      return { notes: [saved, ...s.notes] }
    })
    schedulePersist(get)
    return saved!
  },

  deleteNote: (id) => {
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }))
    schedulePersist(get)
  },

  updateSettings: (patch) => {
    const apply = () => {
      if (patch.locale) setAppLocale(patch.locale)
      if (patch.cloudSyncEnabled !== undefined) writeCloudSyncPref(!!patch.cloudSyncEnabled)
      set((s) => {
        const settings = { ...s.settings, ...patch }
        const touchesAccount = ACCOUNT_FIELDS.some((k) => patch[k] !== undefined)
        const accounts = touchesAccount
          ? s.accounts.map((a) =>
              a.id === s.settings.activeAccountId
                ? {
                    ...a,
                    name: settings.accountName,
                    currency: settings.currency,
                    startingBalance: settings.startingBalance,
                    riskPerTrade: settings.riskPerTrade,
                    dailyLossLimit: settings.dailyLossLimit,
                  }
                : a,
            )
          : s.accounts
        return { settings, accounts }
      })
      schedulePersist(get)
    }
    if (patch.locale) {
      void ensureLocale(patch.locale).then(apply)
      return
    }
    apply()
  },

  switchAccount: (id) => {
    const s = get()
    if (id === s.settings.activeAccountId) return
    const flushed = snapshot(s).accounts
    const next = flushed.find((a) => a.id === id)
    if (!next) return
    set({
      accounts: flushed,
      trades: next.trades,
      notes: next.notes,
      cashflows: next.cashflows ?? [],
      settings: settingsFromAccount(s.settings, next),
    })
    schedulePersist(get)
  },

  createAccount: (input) => {
    const s = get()
    const flushed = snapshot(s).accounts
    const palette: AccountColor[] = ['green', 'sky', 'violet', 'amber', 'rose']
    const used = new Set(flushed.map((a) => a.color))
    const color = input.color ?? palette.find((c) => !used.has(c)) ?? 'green'
    const account: AccountBook = {
      id: uid(),
      name: input.name.trim() || 'Nueva cuenta',
      broker: input.broker?.trim() ?? '',
      type: input.type ?? 'live',
      color,
      currency: input.currency ?? s.settings.currency,
      startingBalance: input.startingBalance ?? 10000,
      riskPerTrade: input.riskPerTrade ?? s.settings.riskPerTrade,
      dailyLossLimit: input.dailyLossLimit ?? 0,
      createdAt: new Date().toISOString(),
      trades: [],
      notes: [],
      cashflows: [],
    }
    set({
      accounts: [...flushed, account],
      trades: [],
      notes: [],
      cashflows: [],
      settings: settingsFromAccount(s.settings, account),
    })
    schedulePersist(get)
    return account.id
  },

  updateAccount: (id, patch) => {
    set((s) => {
      const accounts = s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a))
      const active = accounts.find((a) => a.id === s.settings.activeAccountId)
      return {
        accounts,
        settings: active ? settingsFromAccount(s.settings, active) : s.settings,
      }
    })
    schedulePersist(get)
  },

  deleteAccount: (id) => {
    const s = get()
    if (s.accounts.length <= 1) return false
    const flushed = snapshot(s).accounts.filter((a) => a.id !== id)
    if (!flushed.length) return false
    const stay = s.settings.activeAccountId === id ? flushed[0] : flushed.find((a) => a.id === s.settings.activeAccountId) ?? flushed[0]
    set({
      accounts: flushed,
      trades: stay.trades,
      notes: stay.notes,
      cashflows: stay.cashflows ?? [],
      settings: settingsFromAccount(s.settings, stay),
    })
    schedulePersist(get)
    return true
  },

  duplicateAccount: (id) => {
    const s = get()
    const flushed = snapshot(s).accounts
    const src = flushed.find((a) => a.id === id)
    if (!src) return null
    const copy: AccountBook = {
      ...src,
      id: uid(),
      name: `${src.name} (copia)`,
      createdAt: new Date().toISOString(),
      trades: [],
      notes: [],
      cashflows: [],
    }
    set({ accounts: [...flushed, copy] })
    schedulePersist(get)
    return copy.id
  },

  addCashflow: ({ kind, amount, date, note }) => {
    const amt = Math.abs(amount)
    if (!(amt > 0) || !date) return
    const flow: Cashflow = { id: uid(), kind, amount: amt, date, note: (note ?? '').trim() }
    set((s) => ({ cashflows: [flow, ...s.cashflows] }))
    schedulePersist(get)
  },

  deleteCashflow: (id) => {
    set((s) => ({ cashflows: s.cashflows.filter((c) => c.id !== id) }))
    schedulePersist(get)
  },

  upsertSetup: ({ id, name, notes, checklist }) => {
    const title = name.trim()
    if (!title) return
    const now = new Date().toISOString()
    const items = checklist
      .map((c) => ({ id: c.id?.trim() || uid(), label: c.label.trim() }))
      .filter((c) => c.label)
    set((s) => {
      const playbook = s.settings.playbook ?? []
      const existing = id ? playbook.find((p) => p.id === id) : undefined
      const setup: PlaybookSetup = {
        id: existing?.id ?? uid(),
        name: title,
        notes: (notes ?? '').trim(),
        checklist: items,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      const next = existing ? playbook.map((p) => (p.id === existing.id ? setup : p)) : [...playbook, setup]
      return { settings: { ...s.settings, playbook: next } }
    })
    schedulePersist(get)
  },

  deleteSetup: (id) => {
    set((s) => {
      const flushed = snapshot(s)
      const accounts = flushed.accounts.map((a) => ({ ...a, trades: stripSetup(a.trades, id) }))
      const active = accounts.find((a) => a.id === s.settings.activeAccountId) ?? accounts[0]
      return {
        accounts,
        trades: active?.trades ?? [],
        settings: { ...s.settings, playbook: (s.settings.playbook ?? []).filter((p) => p.id !== id) },
      }
    })
    schedulePersist(get)
  },

  openTradeModal: (trade, presetDate) => set({ tradeModal: { open: true, trade, presetDate } }),
  closeTradeModal: () => set({ tradeModal: { open: false } }),
  openShareCard: (target) => set({ shareTarget: target }),
  closeShareCard: () => set({ shareTarget: null }),

  importData: (raw, mode) => {
    const parsed = parseJournalFile(raw)
    if (!parsed.ok) return parsed
    const incoming = hydrate(parsed.data)
    set((s) => {
      if (mode === 'replace') return incoming
      const current = snapshot(s)
      const byId = new Map(current.accounts.map((a) => [a.id, a]))
      for (const acc of incoming.accounts) {
        const prev = byId.get(acc.id)
        if (!prev) {
          byId.set(acc.id, acc)
          continue
        }
        const tradeIds = new Set(prev.trades.map((t) => t.id))
        const tradePrints = new Set(prev.trades.map(tradeFingerprint))
        const noteIds = new Set(prev.notes.map((n) => n.id))
        const flowIds = new Set((prev.cashflows ?? []).map((c) => c.id))
        const freshTrades = acc.trades.filter((t) => {
          if (tradeIds.has(t.id)) return false
          const fp = tradeFingerprint(t)
          if (tradePrints.has(fp)) return false
          tradeIds.add(t.id)
          tradePrints.add(fp)
          return true
        })
        byId.set(acc.id, {
          ...prev,
          trades: [...prev.trades, ...freshTrades],
          notes: [...prev.notes, ...acc.notes.filter((n) => !noteIds.has(n.id))],
          cashflows: [...(prev.cashflows ?? []), ...(acc.cashflows ?? []).filter((c) => !flowIds.has(c.id))],
        })
      }
      const accounts = [...byId.values()]
      const active = accounts.find((a) => a.id === s.settings.activeAccountId) ?? accounts[0]
      const mergedSettings = {
        ...s.settings,
        playbook: mergePlaybook(s.settings.playbook, incoming.settings.playbook),
      }
      return {
        accounts,
        trades: active.trades,
        notes: active.notes,
        cashflows: active.cashflows ?? [],
        settings: settingsFromAccount(mergedSettings, active),
      }
    })
    schedulePersist(get)
    return { ok: true, skippedTrades: parsed.skippedTrades, skippedNotes: parsed.skippedNotes }
  },

  loadDemo: () => {
    set((s) => ({
      trades: generateDemoTrades(),
      notes: generateDemoNotes(),
      cashflows: [],
      settings: { ...s.settings, startingBalance: s.settings.startingBalance || 25000, demoData: true },
    }))
    schedulePersist(get)
  },

  completeOnboarding: (payload) => {
    const now = new Date().toISOString()
    const name = payload.traderName.trim() || 'Trader'
    const accountName = payload.accountName.trim() || 'Cuenta principal'
    const s = get()
    const flushed = snapshot(s).accounts
    const current = flushed.find((a) => a.id === s.settings.activeAccountId) ?? flushed[0]
    const preferredMarkets = payload.preferredMarkets.length ? payload.preferredMarkets : [payload.defaultMarket]
    const defaultMarket = preferredMarkets.includes(payload.defaultMarket) ? payload.defaultMarket : preferredMarkets[0]
    let trades = current?.trades ?? []
    let notes = current?.notes ?? []
    let cashflows = current?.cashflows ?? []
    let demoData = !!s.settings.demoData && trades.length + notes.length > 0
    if (payload.loadDemo) {
      trades = generateDemoTrades()
      notes = generateDemoNotes()
      cashflows = []
      demoData = true
    } else if (payload.clearHistory) {
      trades = []
      notes = []
      cashflows = []
      demoData = false
    }
    const account: AccountBook = {
      id: current?.id ?? DEFAULT_ACCOUNT_ID,
      name: accountName,
      broker: payload.broker.trim(),
      type: payload.type,
      color: payload.color,
      currency: payload.currency,
      startingBalance: payload.startingBalance,
      riskPerTrade: payload.riskPerTrade,
      dailyLossLimit: payload.dailyLossLimit,
      createdAt: current?.createdAt ?? now,
      trades,
      notes,
      cashflows,
    }
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      traderName: name,
      tradeFormMode: payload.tradeFormMode,
      activeAccountId: account.id,
      accountName,
      currency: payload.currency,
      startingBalance: payload.startingBalance,
      riskPerTrade: payload.riskPerTrade,
      dailyLossLimit: payload.dailyLossLimit,
      preferredMarkets,
      defaultMarket,
      defaultFees: payload.defaultFees,
      weekStartsOn: payload.weekStartsOn,
      onboardingCompleted: true,
      tutorialCompleted: false,
      playbook: s.settings.playbook ?? [],
      avatar: s.settings.avatar,
      demoData,
      locale: s.settings.locale ?? 'es',
    }
    const others = flushed.filter((a) => a.id !== account.id)
    writePref('atrium.page', 'dashboard')
    set({ accounts: [account, ...others], trades, notes, cashflows, settings, page: 'dashboard', tutorialActive: false, loadError: null })
    persistNow(get)
  },

  startTutorial: () => {
    try {
      localStorage.setItem('atrium.sidebar', '0')
    } catch {
      /* ignore */
    }
    writePref('atrium.page', 'dashboard')
    set({
      tutorialActive: true,
      page: 'dashboard',
      sidebarCollapsed: false,
      tradeModal: { open: false },
      shareTarget: null,
    })
  },

  finishTutorial: () => {
    set((s) => ({
      tutorialActive: false,
      settings: { ...s.settings, tutorialCompleted: true },
    }))
    schedulePersist(get)
  },

  clearAll: () => {
    set((s) => ({
      trades: [],
      notes: [],
      cashflows: [],
      settings: { ...s.settings, demoData: false },
    }))
    persistNow(get)
  },

  toast: (message, kind = 'info') => {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 5600 : 3200)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function getBackup(): PersistedData {
  const { settings, accounts } = snapshot(useStore.getState())
  return { version: 2, settings, accounts, trades: [], notes: [] }
}
