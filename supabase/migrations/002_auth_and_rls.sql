-- 002: Auth (user_id → auth.users) + Row Level Security
-- Aplica después de 001_executions_trades.sql
-- Un usuario solo ve / muta sus propias filas.

-- ---------------------------------------------------------------------------
-- accounts.user_id → UUID vinculado a auth.users
-- ---------------------------------------------------------------------------
ALTER TABLE accounts
  ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_user_id_fkey;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- trades.user_id
-- ---------------------------------------------------------------------------
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS user_id UUID;

UPDATE trades t
SET user_id = a.user_id
FROM accounts a
WHERE t.account_id = a.id
  AND t.user_id IS NULL;

ALTER TABLE trades
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE trades
  DROP CONSTRAINT IF EXISTS trades_user_id_fkey;

ALTER TABLE trades
  ADD CONSTRAINT trades_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS trades_user_id_idx ON trades (user_id);
CREATE INDEX IF NOT EXISTS trades_user_opened_idx ON trades (user_id, opened_at);

-- ---------------------------------------------------------------------------
-- executions.user_id
-- ---------------------------------------------------------------------------
ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS user_id UUID;

UPDATE executions e
SET user_id = a.user_id
FROM accounts a
WHERE e.account_id = a.id
  AND e.user_id IS NULL;

ALTER TABLE executions
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE executions
  DROP CONSTRAINT IF EXISTS executions_user_id_fkey;

ALTER TABLE executions
  ADD CONSTRAINT executions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS executions_user_id_idx ON executions (user_id);
CREATE INDEX IF NOT EXISTS executions_user_ticker_time_idx ON executions (user_id, ticker, executed_at);

-- ---------------------------------------------------------------------------
-- import_batches: RLS vía account.user_id (sin columna propia)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- RLS policies — trades
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS trades_select_own ON trades;
DROP POLICY IF EXISTS trades_insert_own ON trades;
DROP POLICY IF EXISTS trades_update_own ON trades;
DROP POLICY IF EXISTS trades_delete_own ON trades;

CREATE POLICY trades_select_own ON trades
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY trades_insert_own ON trades
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY trades_update_own ON trades
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY trades_delete_own ON trades
  FOR DELETE
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS policies — executions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS executions_select_own ON executions;
DROP POLICY IF EXISTS executions_insert_own ON executions;
DROP POLICY IF EXISTS executions_update_own ON executions;
DROP POLICY IF EXISTS executions_delete_own ON executions;

CREATE POLICY executions_select_own ON executions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY executions_insert_own ON executions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY executions_update_own ON executions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY executions_delete_own ON executions
  FOR DELETE
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS policies — accounts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS accounts_select_own ON accounts;
DROP POLICY IF EXISTS accounts_insert_own ON accounts;
DROP POLICY IF EXISTS accounts_update_own ON accounts;
DROP POLICY IF EXISTS accounts_delete_own ON accounts;

CREATE POLICY accounts_select_own ON accounts
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY accounts_insert_own ON accounts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY accounts_update_own ON accounts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY accounts_delete_own ON accounts
  FOR DELETE
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS policies — import_batches (vía accounts.user_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS import_batches_select_own ON import_batches;
DROP POLICY IF EXISTS import_batches_insert_own ON import_batches;
DROP POLICY IF EXISTS import_batches_update_own ON import_batches;
DROP POLICY IF EXISTS import_batches_delete_own ON import_batches;

CREATE POLICY import_batches_select_own ON import_batches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = import_batches.account_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY import_batches_insert_own ON import_batches
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = import_batches.account_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY import_batches_update_own ON import_batches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = import_batches.account_id
        AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = import_batches.account_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY import_batches_delete_own ON import_batches
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = import_batches.account_id
        AND a.user_id = auth.uid()
    )
  );
