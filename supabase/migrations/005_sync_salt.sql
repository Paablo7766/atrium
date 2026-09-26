-- 005: Sal PBKDF2 compartida entre dispositivos (sync multi-dispositivo)
-- Aplica después de 004_encrypted_sync.sql
--
-- La sal NO es secreta: es pública por diseño en PBKDF2 y solo sirve combinada con
-- la contraseña maestra (que nunca sale del dispositivo). Sin la contraseña, la sal
-- no permite descifrar el diario ni los blobs de sync.

CREATE TABLE IF NOT EXISTS user_crypto_salts (
  user_id    UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  salt       TEXT NOT NULL CHECK (salt ~ '^[0-9a-f]+$'),
  kdf        TEXT NOT NULL DEFAULT 'pbkdf2' CHECK (kdf = 'pbkdf2'),
  iterations INT NOT NULL DEFAULT 200000 CHECK (iterations >= 200000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_crypto_salts IS
  'Sal PBKDF2 por usuario para derivar la misma clave en todos los dispositivos. Valor público; no sustituye a la contraseña maestra.';

COMMENT ON COLUMN user_crypto_salts.salt IS
  'Sal hex (16 bytes). Seguro en claro: sin la contraseña maestra del usuario no deriva la clave de cifrado.';

-- ---------------------------------------------------------------------------
-- RLS — cada usuario solo accede a su sal
-- ---------------------------------------------------------------------------
ALTER TABLE user_crypto_salts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_crypto_salts_select_own ON user_crypto_salts;
DROP POLICY IF EXISTS user_crypto_salts_insert_own ON user_crypto_salts;
DROP POLICY IF EXISTS user_crypto_salts_update_own ON user_crypto_salts;
DROP POLICY IF EXISTS user_crypto_salts_delete_own ON user_crypto_salts;

CREATE POLICY user_crypto_salts_select_own ON user_crypto_salts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY user_crypto_salts_insert_own ON user_crypto_salts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY user_crypto_salts_update_own ON user_crypto_salts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_crypto_salts_delete_own ON user_crypto_salts
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Endurecimiento (paridad con 003_harden_rls.sql)
-- ---------------------------------------------------------------------------
ALTER TABLE user_crypto_salts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE user_crypto_salts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_crypto_salts TO authenticated;

DROP TRIGGER IF EXISTS user_crypto_salts_enforce_uid ON user_crypto_salts;
CREATE TRIGGER user_crypto_salts_enforce_uid
  BEFORE INSERT OR UPDATE ON user_crypto_salts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_auth_uid();
