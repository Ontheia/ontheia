-- Artifacts: allow the 'pdf' kind (binary files presented in the panel viewer)
--
-- PDFs are the first artifacts without a text snapshot: app.artifact_versions
-- stays empty for them, only binding_sha is tracked so an external change is
-- detectable. The panel streams the bytes from the file instead of rendering
-- a stored version. Kind is derived from the file extension, so existing rows
-- self-correct on their next read.

BEGIN;

ALTER TABLE app.artifacts DROP CONSTRAINT artifacts_kind_check;
ALTER TABLE app.artifacts ADD CONSTRAINT artifacts_kind_check
    CHECK (kind IN ('markdown', 'text', 'mermaid', 'pdf'));

COMMIT;
