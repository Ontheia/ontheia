-- Migration V55: vector.global.* Schreib-RLS sicherstellen
-- Re-applies the intended V53 state (idempotent) to guarantee correct DB state
-- regardless of what the originally-applied V53 contained.

BEGIN;

-- is_shared_namespace: nur vector.global.* (kein vector.shared.*)
CREATE OR REPLACE FUNCTION vector.is_shared_namespace(ns text) RETURNS boolean AS $$
BEGIN
    RETURN ns LIKE 'vector.global.%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- vector.documents: Lesen = owner | admin | public | global; Schreiben = owner | admin only
DROP POLICY IF EXISTS documents_isolation_policy ON vector.documents;
CREATE POLICY documents_isolation_policy ON vector.documents
  USING (
    owner_id = app.current_user_id()
    OR app.is_admin()
    OR vector.is_public_namespace(namespace)
    OR vector.is_shared_namespace(namespace)
  )
  WITH CHECK (
    owner_id = app.current_user_id()
    OR app.is_admin()
  );

-- vector.documents_768: gleiche Logik
DROP POLICY IF EXISTS documents_768_isolation_policy ON vector.documents_768;
CREATE POLICY documents_768_isolation_policy ON vector.documents_768
  USING (
    owner_id = app.current_user_id()
    OR app.is_admin()
    OR vector.is_public_namespace(namespace)
    OR vector.is_shared_namespace(namespace)
  )
  WITH CHECK (
    owner_id = app.current_user_id()
    OR app.is_admin()
  );

COMMIT;
