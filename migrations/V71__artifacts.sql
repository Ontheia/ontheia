-- Artifacts: addressable, versioned file mirrors (editable code box, iteration 1)
--
-- An artifact is a user resource (not chat-bound): file-bound artifacts are
-- deduplicated per (user_id, binding_path) and referenced from any number of
-- chats/messages via artifact_refs. The file on disk stays the source of
-- truth; artifact_versions holds immutable snapshots for history, diffing and
-- token-cheap rehydration (artifact_read serves the exact version the model
-- talked about).
--
-- Patterns mirrored from existing migrations:
--   V36  user_id BEFORE INSERT trigger (app.set_run_logs_user_id)
--   V39  FORCE ROW LEVEL SECURITY on all app tables
--   V45  strict privacy policies without admin bypass (chats/chat_messages)
--   V41  default privileges for ontheia_app cover new tables (no grants here)
--
-- ID types follow the referenced tables: chats.id = text,
-- chat_messages.id = uuid, users.id = uuid.

BEGIN;

-- Head: the addressable artifact (user resource)
CREATE TABLE IF NOT EXISTS app.artifacts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    kind          text NOT NULL CHECK (kind IN ('markdown','text')),
    title         text,
    binding_type  text NOT NULL CHECK (binding_type IN ('file','ephemeral')),
    binding_path  text,                 -- file only: relative files-skill path (write.py target)
    binding_sha   text,                 -- last known sha256 (conflict token for write.py --expect-sha256)
    complete      boolean NOT NULL DEFAULT true,  -- false when the snapshot is a truncated read
    head_version  uuid,                 -- FK added below (circular with artifact_versions)
    metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    deleted_at    timestamptz
);

-- History: immutable content snapshots
CREATE TABLE IF NOT EXISTS app.artifact_versions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id  uuid NOT NULL REFERENCES app.artifacts(id) ON DELETE CASCADE,
    content      text NOT NULL,
    sha256       text NOT NULL,
    author       text NOT NULL CHECK (author IN ('user','agent')),
    created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.artifacts
    ADD CONSTRAINT artifacts_head_version_fk
    FOREIGN KEY (head_version) REFERENCES app.artifact_versions(id) ON DELETE SET NULL;

-- n:m message <-> artifact. Refs cascade with their message/chat; the shared
-- artifact itself survives chat deletion (user resource, deliberately no
-- cascade from chats onto artifacts).
CREATE TABLE IF NOT EXISTS app.artifact_refs (
    artifact_id  uuid NOT NULL REFERENCES app.artifacts(id) ON DELETE CASCADE,
    message_id   uuid NOT NULL REFERENCES app.chat_messages(id) ON DELETE CASCADE,
    chat_id      text NOT NULL REFERENCES app.chats(id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (artifact_id, message_id)
);

-- Dedup for file-bound artifacts: one live artifact per (user, path)
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_user_path_uidx
    ON app.artifacts (user_id, binding_path)
    WHERE binding_type = 'file' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS artifacts_user_type_idx    ON app.artifacts (user_id, binding_type);
CREATE INDEX IF NOT EXISTS artifact_versions_hist_idx ON app.artifact_versions (artifact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS artifact_refs_message_idx  ON app.artifact_refs (message_id);
CREATE INDEX IF NOT EXISTS artifact_refs_chat_idx     ON app.artifact_refs (chat_id);

-- Auto user_id on insert (no generic app.set_user_id exists; pattern from V36)
CREATE OR REPLACE FUNCTION app.set_artifacts_user_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := app.current_user_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_artifacts_user_id ON app.artifacts;
CREATE TRIGGER trg_set_artifacts_user_id
    BEFORE INSERT ON app.artifacts
    FOR EACH ROW EXECUTE FUNCTION app.set_artifacts_user_id();

-- RLS: strict owner isolation, no admin bypass (like chats since V45).
-- FORCE so the policy also binds the table owner (V39/V67 convention).
ALTER TABLE app.artifacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.artifacts         FORCE  ROW LEVEL SECURITY;
ALTER TABLE app.artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.artifact_versions FORCE  ROW LEVEL SECURITY;
ALTER TABLE app.artifact_refs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.artifact_refs     FORCE  ROW LEVEL SECURITY;

CREATE POLICY artifacts_strict_privacy ON app.artifacts
    USING (user_id = app.current_user_id());

CREATE POLICY artifact_versions_strict_privacy ON app.artifact_versions
    USING (EXISTS (SELECT 1 FROM app.artifacts a
                   WHERE a.id = app.artifact_versions.artifact_id
                     AND a.user_id = app.current_user_id()));

CREATE POLICY artifact_refs_strict_privacy ON app.artifact_refs
    USING (EXISTS (SELECT 1 FROM app.artifacts a
                   WHERE a.id = app.artifact_refs.artifact_id
                     AND a.user_id = app.current_user_id()));

COMMIT;
