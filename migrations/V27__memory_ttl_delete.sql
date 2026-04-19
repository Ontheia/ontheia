-- Add TTL/Soft-Delete fields for memory documents
ALTER TABLE vector.documents
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

ALTER TABLE vector.documents_768
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Optional indexes to speed up cleanup/filters
CREATE INDEX IF NOT EXISTS vector_documents_expires_idx ON vector.documents (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS vector_documents_deleted_idx ON vector.documents (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS vector_documents_768_expires_idx ON vector.documents_768 (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS vector_documents_768_deleted_idx ON vector.documents_768 (deleted_at) WHERE deleted_at IS NOT NULL;
