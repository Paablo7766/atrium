/**
 * SQLite schema aligned with src/types.ts and prisma/ naming conventions.
 * Column names use snake_case; JSON columns store string arrays / nested lists.
 */

export const DB_FILENAME = 'journal.db'

export const TABLES = {
  migrations: 'schema_migrations',
  settings: 'settings',
  accounts: 'accounts',
  trades: 'trades',
  journalEntries: 'journal_entries',
  cashflows: 'cashflows',
  playbookSetups: 'playbook_setups',
  playbookItems: 'playbook_items',
} as const

/** Current schema version — bump when adding migrations/00N_*.ts */
export const SCHEMA_VERSION = 3

export type SettingsRow = {
  id: 1
  trader_name: string
  avatar: string | null
  trade_form_mode: string
  active_account_id: string
  account_name: string
  currency: string
  starting_balance: number
  risk_per_trade: number
  daily_loss_limit: number
  default_market: string
  preferred_markets: string
  default_fees: number
  week_starts_on: number
  onboarding_completed: number
  tutorial_completed: number
  demo_data: number
  locale: string
  /** 0/1 — sync multi-dispositivo activado */
  cloud_sync_enabled: number
  /** ISO timestamp de la última sync cloud exitosa */
  last_cloud_sync_at: string | null
  /** Última versión de la app cuya tarjeta Novedades ya se mostró */
  last_seen_app_version: string | null
}

export type AccountRow = {
  id: string
  name: string
  broker: string
  type: string
  color: string
  currency: string
  starting_balance: number
  risk_per_trade: number
  daily_loss_limit: number
  created_at: string
}

export type TradeRow = {
  id: string
  account_id: string
  symbol: string
  market: string
  direction: string
  status: string
  entry_date: string
  exit_date: string | null
  entry_price: number
  exit_price: number | null
  quantity: number
  multiplier: number
  fees: number
  stop_loss: number | null
  take_profit: number | null
  strategy: string
  tags: string
  notes: string
  rating: number
  emotion: string | null
  pnl_override: number | null
  setup_id: string | null
  checklist_done: string | null
  mistakes: string | null
  created_at: string
  updated_at: string
}

export type JournalEntryRow = {
  id: string
  account_id: string
  date: string
  mood: number
  title: string
  content: string
  updated_at: string
}

export type CashflowRow = {
  id: string
  account_id: string
  date: string
  kind: string
  amount: number
  note: string
}

export type PlaybookSetupRow = {
  id: string
  name: string
  notes: string
  created_at: string
  updated_at: string
}

export type PlaybookItemRow = {
  id: string
  setup_id: string
  label: string
  sort_order: number
}
