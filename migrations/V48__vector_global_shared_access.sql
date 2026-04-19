-- Migration V48: Global Namespace Shared Access
-- Diese Migration integriert den 'vector.global.*' Bereich offiziell in die Shared-Logik,
-- damit alle autorisierten Benutzer (z.B. Wolfgang & Alexandra) auf gemeinsames 
-- Wissen wie Rezepte, Business-Projekte und System-Doku zugreifen können.

BEGIN;

-- 1. Erweiterung der Shared-Namespace Erkennung
CREATE OR REPLACE FUNCTION vector.is_shared_namespace(ns text) RETURNS boolean AS $$
BEGIN
    -- Historische 'shared' Namespaces und neue hierarchische 'global' Namespaces
    RETURN ns LIKE 'vector.shared.%' OR ns LIKE 'vector.global.%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Aktualisierung der Policies für die OpenAI-Vektortabelle (1536 dim)
DROP POLICY IF EXISTS documents_isolation_policy ON vector.documents;
CREATE POLICY documents_isolation_policy ON vector.documents
  USING (
    owner_id = app.current_user_id()             -- Eigene Daten
    OR app.is_admin()                            -- Admin Zugriff (Wolfgang)
    OR vector.is_public_namespace(namespace)      -- Öffentliches Know-how (Read)
    OR vector.is_shared_namespace(namespace)      -- Gemeinsames Know-how (Read/Write)
  )
  WITH CHECK (
    owner_id = app.current_user_id()             -- Eigene Daten schreiben
    OR app.is_admin()                            -- Admin darf alles
    OR vector.is_shared_namespace(namespace)      -- In Shared/Global darf jeder schreiben
  );

-- 3. Aktualisierung der Policies für die lokale Vektortabelle (768 dim)
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
