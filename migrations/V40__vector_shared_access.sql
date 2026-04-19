-- Erweiterung der Vektor-RLS für öffentliche und geteilte Namespaces
BEGIN;

-- 1. Helper-Funktionen für Namespace-Kategorien
CREATE OR REPLACE FUNCTION vector.is_public_namespace(ns text) RETURNS boolean AS $$
BEGIN
    RETURN ns LIKE 'vector.public.%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION vector.is_shared_namespace(ns text) RETURNS boolean AS $$
BEGIN
    RETURN ns LIKE 'vector.shared.%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Policies für vector.documents aktualisieren
-- Wir löschen die alte restriktive Policy und ersetzen sie durch eine erweiterte Version

DROP POLICY IF EXISTS documents_isolation_policy ON vector.documents;
CREATE POLICY documents_isolation_policy ON vector.documents
  USING (
    owner_id = app.current_user_id()             -- Eigene Daten
    OR app.is_admin()                            -- Admin Zugriff
    OR vector.is_public_namespace(namespace)      -- Öffentliches Know-how (Read)
    OR vector.is_shared_namespace(namespace)      -- Gemeinsames Know-how (Read/Write)
  )
  WITH CHECK (
    owner_id = app.current_user_id()             -- Eigene Daten schreiben
    OR app.is_admin()                            -- Admin darf alles
    OR vector.is_shared_namespace(namespace)      -- In Shared Namespaces darf jeder schreiben
  );

-- 3. Gleiche Logik für die 768er Vektor-Tabelle
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
    OR vector.is_shared_namespace(namespace)
  );

COMMIT;
