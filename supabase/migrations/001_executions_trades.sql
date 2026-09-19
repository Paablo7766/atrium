-- Trading Journal: Executions (fills) ↔ Trades (posiciones consolidadas)
-- Compatible con Supabase (PostgreSQL 15+)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE trade_direction AS ENUM ('LONG', 'SHORT');
CREATE TYPE trade_status AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE execution_side AS ENUM ('BUY', 'SELL');
CREATE TYPE instrument_type AS ENUM ('STOCK', 'CFD', 'FOREX', 'FUTURE', 'OPTION', 'CRYPTO', 'OTHER');
CREATE TYPE broker_source AS ENUM (
  'XTB',
  'INTERACTIVE_BROKERS',
  'DEGIRO',
  'FOMO',
  'AXIOM',
  'MANUAL',
  'OTHER'
);

CREATE TABLE accounts (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  broker     broker_source NOT NULL DEFAULT 'OTHER',
  currency   CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX accounts_user_id_idx ON accounts (user_id);

CREATE TABLE import_batches (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id  TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  broker      broker_source NOT NULL,
  file_name   TEXT,
  row_count   INT NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum    TEXT
);
CREATE INDEX import_batches_account_imported_idx ON import_batches (account_id, imported_at);

CREATE TABLE trades (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id       TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  ticker           TEXT NOT NULL,
  instrument_type  instrument_type NOT NULL DEFAULT 'OTHER',
  direction        trade_direction NOT NULL,
  status           trade_status NOT NULL DEFAULT 'OPEN',

  quantity         NUMERIC(24, 8) NOT NULL,
  quantity_closed  NUMERIC(24, 8) NOT NULL DEFAULT 0,
  avg_entry_price  NUMERIC(24, 10) NOT NULL,
  avg_exit_price   NUMERIC(24, 10),
  fees_total       NUMERIC(24, 8) NOT NULL DEFAULT 0,
  net_pnl          NUMERIC(24, 8),

  base_currency    CHAR(3) NOT NULL,
  quote_currency   CHAR(3) NOT NULL,
  multiplier       NUMERIC(18, 8) NOT NULL DEFAULT 1,

  opened_at        TIMESTAMPTZ NOT NULL,
  closed_at        TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trades_account_ticker_status_idx ON trades (account_id, ticker, status);
CREATE INDEX trades_account_opened_idx ON trades (account_id, opened_at);

CREATE TABLE executions (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id       TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  trade_id         TEXT REFERENCES trades (id) ON DELETE SET NULL,
  import_batch_id  TEXT REFERENCES import_batches (id) ON DELETE SET NULL,

  broker           broker_source NOT NULL,
  external_id      TEXT,
  ticker           TEXT NOT NULL,
  instrument_type  instrument_type NOT NULL DEFAULT 'OTHER',
  side             execution_side NOT NULL,

  quantity         NUMERIC(24, 8) NOT NULL CHECK (quantity > 0),
  price            NUMERIC(24, 10) NOT NULL CHECK (price >= 0),
  fees             NUMERIC(24, 8) NOT NULL DEFAULT 0,

  base_currency    CHAR(3) NOT NULL,
  quote_currency   CHAR(3) NOT NULL,
  multiplier       NUMERIC(18, 8) NOT NULL DEFAULT 1,

  executed_at      TIMESTAMPTZ NOT NULL,
  raw_row          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT executions_account_broker_external_uid UNIQUE (account_id, broker, external_id)
);
CREATE INDEX executions_account_ticker_time_idx ON executions (account_id, ticker, executed_at);
CREATE INDEX executions_trade_id_idx ON executions (trade_id);

-- RLS (Supabase): activar y políticas por user_id vía accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
