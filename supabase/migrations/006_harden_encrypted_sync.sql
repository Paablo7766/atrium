-- 006: Endurecer encrypted_sync_snapshots (paridad con 003 / 005)
-- Aplica después de 005_sync_salt.sql

ALTER TABLE encrypted_sync_snapshots FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE encrypted_sync_snapshots FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE encrypted_sync_snapshots TO authenticated;

DROP TRIGGER IF EXISTS encrypted_sync_snapshots_enforce_uid ON encrypted_sync_snapshots;
CREATE TRIGGER encrypted_sync_snapshots_enforce_uid
  BEFORE INSERT OR UPDATE ON encrypted_sync_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_auth_uid();
