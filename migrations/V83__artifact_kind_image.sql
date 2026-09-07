-- Artifacts: allow the 'image' kind (binary files presented in the panel viewer)
--
-- Images are the second artifact kind without a text snapshot, next to PDFs:
-- app.artifact_versions stays empty for them, only binding_sha is tracked so
-- an external change is detectable. The panel streams the bytes from the file
-- (GET /api/artifacts/:id/raw) and renders them as an <img> instead of a
-- stored version — image data never reaches the model or the chat history.
-- First consumer: title images of ingested recipe documents. SVG is
-- deliberately NOT an image kind (script-bearing when opened directly in a
-- browser); kindForPath keeps leaving it as 'text'. Kind is derived from the
-- file extension, so existing rows self-correct on their next read.

BEGIN;

ALTER TABLE app.artifacts DROP CONSTRAINT artifacts_kind_check;
ALTER TABLE app.artifacts ADD CONSTRAINT artifacts_kind_check
    CHECK (kind IN ('markdown', 'text', 'mermaid', 'pdf', 'image'));

COMMIT;