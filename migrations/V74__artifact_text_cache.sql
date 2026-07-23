-- Artifacts: derived text cache for binary artifacts (PDF today)
--
-- PDFs carry no artifact_versions snapshot — their bytes are served from the
-- file and the model only ever saw metadata. To let the model actually read a
-- PDF's content, artifact_read extracts it to Markdown (pdfjs text layer) on
-- first request. That conversion is not free, so the result is cached here,
-- keyed by the source file's sha. When the PDF is replaced (binding_sha
-- changes), text_cache_sha no longer matches and the cache is re-extracted.
--
-- This is a derived cache, deliberately kept out of artifact_versions: versions
-- mean editable text snapshots, this is extracted read-only text.

BEGIN;

ALTER TABLE app.artifacts
    ADD COLUMN text_cache      text,
    ADD COLUMN text_cache_sha  text;

COMMENT ON COLUMN app.artifacts.text_cache IS
    'Derived Markdown of a binary artifact (PDF), extracted on first artifact_read.';
COMMENT ON COLUMN app.artifacts.text_cache_sha IS
    'binding_sha the text_cache was extracted from; a mismatch invalidates the cache.';

COMMIT;
