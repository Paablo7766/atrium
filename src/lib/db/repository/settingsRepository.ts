import type Database from 'better-sqlite3-multiple-ciphers'
import {
  DEFAULT_ACCOUNT_ID,
  DEFAULT_SETTINGS,
  normalizePreferredMarkets,
  type AppLocale,
  type Currency,
  type Market,
  type Settings,
  type TradeFormMode,
  type WeekStart,
} from '@/types'
import { sanitizeAvatar } from '@/lib/avatar'
import { TABLES, type SettingsRow } from '../schema'

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? (v as T[]) : fallback
  } catch {
    return fallback
  }
}

export function rowToSettings(row: SettingsRow, playbook: Settings['playbook']): Settings {
  const defaultMarket = (row.default_market as Market) || DEFAULT_SETTINGS.defaultMarket
  const preferred = normalizePreferredMarkets(parseJsonArray<Market>(row.preferred_markets, []), defaultMarket)
  const preferredMarkets = preferred.includes(defaultMarket) ? preferred : [defaultMarket, ...preferred]
  const formMode = row.trade_form_mode === 'pro' ? 'premium' : row.trade_form_mode
  return {
    traderName: row.trader_name || DEFAULT_SETTINGS.traderName,
    avatar: sanitizeAvatar(row.avatar ?? undefined),
    tradeFormMode: (formMode === 'simple' || formMode === 'premium' ? formMode : DEFAULT_SETTINGS.tradeFormMode) as TradeFormMode,
    activeAccountId: row.active_account_id || DEFAULT_ACCOUNT_ID,
    accountName: row.account_name || DEFAULT_SETTINGS.accountName,
    currency: (row.currency as Currency) || DEFAULT_SETTINGS.currency,
    startingBalance: row.starting_balance ?? DEFAULT_SETTINGS.startingBalance,
    riskPerTrade: row.risk_per_trade ?? DEFAULT_SETTINGS.riskPerTrade,
    dailyLossLimit: row.daily_loss_limit ?? 0,
    defaultMarket: preferredMarkets.includes(defaultMarket) ? defaultMarket : preferredMarkets[0],
    preferredMarkets,
    defaultFees: row.default_fees ?? 0,
    weekStartsOn: (row.week_starts_on === 0 ? 0 : 1) as WeekStart,
    onboardingCompleted: !!row.onboarding_completed,
    tutorialCompleted: !!row.tutorial_completed,
    demoData: !!row.demo_data,
    playbook,
    locale: (row.locale === 'en' ? 'en' : 'es') as AppLocale,
  }
}

export function getSettings(db: Database.Database, playbook: Settings['playbook']): Settings | null {
  const row = db.prepare(`SELECT * FROM ${TABLES.settings} WHERE id = 1`).get() as SettingsRow | undefined
  if (!row) return null
  return rowToSettings(row, playbook)
}

export function saveSettings(db: Database.Database, settings: Settings): void {
  const preferredMarkets = settings.preferredMarkets?.length ? settings.preferredMarkets : [settings.defaultMarket]
  db.prepare(`
    INSERT INTO ${TABLES.settings} (
      id, trader_name, avatar, trade_form_mode, active_account_id, account_name,
      currency, starting_balance, risk_per_trade, daily_loss_limit, default_market,
      preferred_markets, default_fees, week_starts_on, onboarding_completed,
      tutorial_completed, demo_data, locale
    ) VALUES (
      1, @trader_name, @avatar, @trade_form_mode, @active_account_id, @account_name,
      @currency, @starting_balance, @risk_per_trade, @daily_loss_limit, @default_market,
      @preferred_markets, @default_fees, @week_starts_on, @onboarding_completed,
      @tutorial_completed, @demo_data, @locale
    )
    ON CONFLICT(id) DO UPDATE SET
      trader_name = excluded.trader_name,
      avatar = excluded.avatar,
      trade_form_mode = excluded.trade_form_mode,
      active_account_id = excluded.active_account_id,
      account_name = excluded.account_name,
      currency = excluded.currency,
      starting_balance = excluded.starting_balance,
      risk_per_trade = excluded.risk_per_trade,
      daily_loss_limit = excluded.daily_loss_limit,
      default_market = excluded.default_market,
      preferred_markets = excluded.preferred_markets,
      default_fees = excluded.default_fees,
      week_starts_on = excluded.week_starts_on,
      onboarding_completed = excluded.onboarding_completed,
      tutorial_completed = excluded.tutorial_completed,
      demo_data = excluded.demo_data,
      locale = excluded.locale
  `).run({
    trader_name: settings.traderName,
    avatar: settings.avatar ?? null,
    trade_form_mode: settings.tradeFormMode,
    active_account_id: settings.activeAccountId,
    account_name: settings.accountName,
    currency: settings.currency,
    starting_balance: settings.startingBalance,
    risk_per_trade: settings.riskPerTrade,
    daily_loss_limit: settings.dailyLossLimit,
    default_market: settings.defaultMarket,
    preferred_markets: JSON.stringify(preferredMarkets),
    default_fees: settings.defaultFees,
    week_starts_on: settings.weekStartsOn,
    onboarding_completed: settings.onboardingCompleted ? 1 : 0,
    tutorial_completed: settings.tutorialCompleted ? 1 : 0,
    demo_data: settings.demoData ? 1 : 0,
    locale: settings.locale,
  })
}

export function ensureDefaultSettings(db: Database.Database): void {
  const row = db.prepare(`SELECT 1 FROM ${TABLES.settings} WHERE id = 1`).get()
  if (row) return
  saveSettings(db, DEFAULT_SETTINGS)
}
