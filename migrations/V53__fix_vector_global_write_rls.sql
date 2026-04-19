-- Migration V53: vector.global.* Schreib-RLS korrigieren
-- V48 erlaubte allen Usern das Schreiben in vector.global.* auf DB-Ebene (WITH CHECK).
-- Die Schreibkontrolle erfolgt nun ausschließlich über den App-Layer (allowedWriteNamespaces
-- in der Agent/Task Memory-Policy). Die DB-RLS wird auf Admin-only für globale Schreibvorgänge
-- beschränkt, um Defence-in-Depth zu gewährleisten.

BEGIN;

-- Aktualisierung der is_shared_namespace Funktion: stellt sicher dass vector.global.* korrekt erkannt wird
CREATE OR REPLACE FUNCTION vector.is_shared_namespace(ns text) RETURNS boolean AS $$
BEGIN
    RETURN ns LIKE 'vector.global.%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Policy für vector.documents (1536 dim):
-- USING (Lesen): owner_id ODER admin ODER public ODER global → alle User können global lesen
-- WITH CHECK (Schreiben): nur owner_id oder admin → App-Policy kontrolliert global-Schreiben
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

-- Policy für vector.documents_768 (768 dim):
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
