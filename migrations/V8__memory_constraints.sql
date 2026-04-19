BEGIN;

-- Die UNIQUE Indizes wurden entfernt, da sie die Speicherung langer Texte verhinderten.
-- Wir nutzen stattdessen einfache Indizes auf dem Namespace für die Performance.

CREATE INDEX IF NOT EXISTS vector_documents_namespace_idx
    ON vector.documents (namespace);

CREATE INDEX IF NOT EXISTS vector_documents_768_namespace_idx
    ON vector.documents_768 (namespace);

COMMIT;
