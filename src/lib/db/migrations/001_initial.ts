/** SQL for migration 001 — kept as TS export so Electron bundle includes it. */
export const SQL_001_INITIAL = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  trader_name TEXT NOT NULL DEFAULT 'Trader',
  avatar TEXT,
  trade_form_mode TEXT NOT NULL DEFAULT 'simple',
  active_account_id TEXT NOT NULL DEFAULT 'account-main',
  account_name TEXT NOT NULL DEFAULT 'Cuenta principal',
  currency TEXT NOT NULL DEFAULT 'USD',
  starting_balance REAL NOT NULL DEFAULT 10000,
  risk_per_trade REAL NOT NULL DEFAULT 1,
  daily_loss_limit REAL NOT NULL DEFAULT 0,
  default_market TEXT NOT NULL DEFAULT 'Futuros',
  preferred_markets TEXT NOT NULL DEFAULT '["Futuros"]',
  default_fees REAL NOT NULL DEFAULT 0,
  week_starts_on INTEGER NOT NULL DEFAULT 1,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  tutorial_completed INTEGER NOT NULL DEFAULT 0,
  demo_data INTEGER NOT NULL DEFAULT 0,
  locale TEXT NOT NULL DEFAULT 'es'
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  broker TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'live',
  color TEXT NOT NULL DEFAULT 'green',
  currency TEXT NOT NULL DEFAULT 'USD',
  starting_balance REAL NOT NULL DEFAULT 10000,
  risk_per_trade REAL NOT NULL DEFAULT 1,
  daily_loss_limit REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'NONE',
  status TEXT NOT NULL DEFAULT 'CLOSED',
  entry_date TEXT NOT NULL,
  exit_date TEXT,
  entry_price REAL NOT NULL DEFAULT 0,
  exit_price REAL,
  quantity REAL NOT NULL DEFAULT 1,
  multiplier REAL NOT NULL DEFAULT 1,
  fees REAL NOT NULL DEFAULT 0,
  stop_loss REAL,
  take_profit REAL,
  strategy TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 0,
  emotion TEXT,
  pnl_override REAL,
  setup_id TEXT,
  checklist_done TEXT,
  mistakes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trades_account_id ON trades(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_entry_date ON trades(entry_date);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  mood INTEGER NOT NULL DEFAULT 3,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_account_id ON journal_entries(account_id);

CREATE TABLE IF NOT EXISTS cashflows (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal')),
  amount REAL NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_cashflows_account_id ON cashflows(account_id);

CREATE TABLE IF NOT EXISTS playbook_setups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playbook_items (
  id TEXT PRIMARY KEY,
  setup_id TEXT NOT NULL REFERENCES playbook_setups(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_playbook_items_setup_id ON playbook_items(setup_id);
`
