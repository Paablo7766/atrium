-- 004: Sync cifrado extremo a extremo (solo blobs + metadatos no sensibles)
-- Aplica después de 003_harden_rls.sql
-- Supabase nunca almacena trades, cuentas ni journal en claro.

-- ---------------------------------------------------------------------------
-- Snapshot cifrado por usuario (journal completo como blob AES-GCM del cliente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS encrypted_sync_snapshots (
  user_id        UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  ciphertext     TEXT NOT NULL,
  nonce          TEXT NOT NULL,
  cipher_version INT NOT NULL DEFAULT 1 CHECK (cipher_version >= 1),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_id      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS encrypted_sync_snapshots_updated_idx
  ON encrypted_sync_snapshots (updated_at DESC);

COMMENT ON TABLE encrypted_sync_snapshots IS
  'Blobs cifrados en cliente. Supabase no puede leer el contenido del diario.';

COMMENT ON COLUMN encrypted_sync_snapshots.ciphertext IS 'Payload AES-GCM (base64) generado en el cliente.';
COMMENT ON COLUMN encrypted_sync_snapshots.nonce IS 'IV/nonce AES-GCM (base64).';
COMMENT ON COLUMN encrypted_sync_snapshots.device_id IS 'Identificador opaco del dispositivo (no PII).';

-- ---------------------------------------------------------------------------
-- RLS — solo el usuario autenticado accede a su blob
-- ---------------------------------------------------------------------------
ALTER TABLE encrypted_sync_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS encrypted_sync_select_own ON encrypted_sync_snapshots;
DROP POLICY IF EXISTS encrypted_sync_insert_own ON encrypted_sync_snapshots;
DROP POLICY IF EXISTS encrypted_sync_update_own ON encrypted_sync_snapshots;
DROP POLICY IF EXISTS encrypted_sync_delete_own ON encrypted_sync_snapshots;

CREATE POLICY encrypted_sync_select_own ON encrypted_sync_snapshots
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY encrypted_sync_insert_own ON encrypted_sync_snapshots
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY encrypted_sync_update_own ON encrypted_sync_snapshots
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY encrypted_sync_delete_own ON encrypted_sync_snapshots
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Tablas legacy (001): dejan de usarse para sync de datos en claro.
-- Se mantienen por compatibilidad de esquema; la app escribe solo en encrypted_sync_snapshots.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE trades IS 'LEGACY — sync actual usa encrypted_sync_snapshots (E2E cifrado).';
COMMENT ON TABLE executions IS 'LEGACY — sync actual usa encrypted_sync_snapshots (E2E cifrado).';
COMMENT ON TABLE accounts IS 'LEGACY — sync actual usa encrypted_sync_snapshots (E2E cifrado).';
