BEGIN;

-- Entferne die UNIQUE Indizes, da sie das Speichern von großen Texten (z.B. E-Mail-Dumps) 
-- aufgrund von B-Tree Größenbeschränkungen (max 2704 bytes) verhindern.
DROP INDEX IF EXISTS vector.vector_documents_namespace_content_idx;
DROP INDEX IF EXISTS vector.vector_documents_768_namespace_content_idx;

-- Optional: Ersetze sie durch normale Indizes (nicht UNIQUE), falls Performance für 
-- exakte Textsuche benötigt wird (aber meistens reicht die Vektor-Suche).
CREATE INDEX IF NOT EXISTS vector_documents_namespace_idx ON vector.documents (namespace);
CREATE INDEX IF NOT EXISTS vector_documents_768_namespace_idx ON vector.documents_768 (namespace);

COMMIT;
