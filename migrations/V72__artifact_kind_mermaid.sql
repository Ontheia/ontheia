-- Artifacts: allow the 'mermaid' kind (standalone .mmd/.mermaid diagram files)
--
-- V71 shipped with kind IN ('markdown','text') as the iteration-1 scope line.
-- The panel now renders Mermaid sources with a live diagram preview, so the
-- promotion derives kind='mermaid' from the file extension. Only the CHECK
-- changes — no data migration; existing rows self-correct on their next read
-- (the promotion upsert rewrites kind from the path).

BEGIN;

ALTER TABLE app.artifacts DROP CONSTRAINT artifacts_kind_check;
ALTER TABLE app.artifacts ADD CONSTRAINT artifacts_kind_check
    CHECK (kind IN ('markdown', 'text', 'mermaid'));

COMMIT;
