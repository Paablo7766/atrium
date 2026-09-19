-- 003: Endurecer RLS — FORCE + impedir spoofing de user_id
-- Aplica después de 002_auth_and_rls.sql

-- Forzar RLS incluso para roles con privilegios de owner en estas tablas
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE trades FORCE ROW LEVEL SECURITY;
ALTER TABLE executions FORCE ROW LEVEL SECURITY;
ALTER TABLE import_batches FORCE ROW LEVEL SECURITY;

-- Revocar acceso amplio; solo authenticated vía políticas
REVOKE ALL ON TABLE accounts FROM PUBLIC, anon;
REVOKE ALL ON TABLE trades FROM PUBLIC, anon;
REVOKE ALL ON TABLE executions FROM PUBLIC, anon;
REVOKE ALL ON TABLE import_batches FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE trades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE executions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE import_batches TO authenticated;

-- Trigger: user_id siempre = auth.uid() (no se puede insertar/actualizar como otro usuario)
CREATE OR REPLACE FUNCTION public.enforce_auth_uid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_enforce_uid ON accounts;
CREATE TRIGGER accounts_enforce_uid
  BEFORE INSERT OR UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_auth_uid();

DROP TRIGGER IF EXISTS trades_enforce_uid ON trades;
CREATE TRIGGER trades_enforce_uid
  BEFORE INSERT OR UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION public.enforce_auth_uid();

DROP TRIGGER IF EXISTS executions_enforce_uid ON executions;
CREATE TRIGGER executions_enforce_uid
  BEFORE INSERT OR UPDATE ON executions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_auth_uid();
