-- History for task context prompts, so an edit in the console can be undone.
--
-- Chains have had app.chain_versions since they were built; tasks never did.
-- app.tasks carries only updated_at — the moment of the last write, not what it
-- overwrote. Editing a context prompt in the admin console was therefore a
-- one-way operation: the previous wording was gone the instant Save was hit.
--
-- The workaround in use was to keep every prompt as a .md file under
-- sources/prompts and edit there first, treating the file as the backup. It
-- holds only as long as nobody edits in the console — and a comparison of all
-- 30 task prompts against their files found two that had drifted exactly that
-- way, each after a console edit that never made it back to the file.
--
-- A trigger, not route logic: this has to catch every write, including the ones
-- from psql and from routes added later. The point is a safety net, and a net
-- with a hole in it where someone forgot to call the helper is not one.

CREATE TABLE app.task_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid NOT NULL REFERENCES app.tasks(id) ON DELETE CASCADE,
  version        integer NOT NULL,
  context_prompt text,
  -- Who caused the change, when app.current_user_id was set by the caller.
  -- Trigger-written rows from a plain psql session leave this NULL rather than
  -- claiming an author.
  created_by     uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, version)
);

CREATE INDEX task_versions_task_idx ON app.task_versions (task_id, version DESC);

COMMENT ON TABLE app.task_versions IS
  'Superseded context prompts. The current one lives in app.tasks.context_prompt; '
  'a row here is always a version that was replaced.';

-- Stores the OLD wording, so the newest row here is the one immediately before
-- what is live. Keeping the current text in both places would mean two sources
-- for the same fact, and they would drift the first time a write missed one.
CREATE OR REPLACE FUNCTION app.record_task_prompt_version()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER: the trigger must be able to write regardless of what the
-- caller may touch. It only ever inserts, never reads anything back.
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  next_version integer;
  actor uuid;
BEGIN
  -- Nothing to preserve when the prompt is untouched. IS DISTINCT FROM also
  -- covers the NULL transitions, which <> would let through unnoticed.
  IF NEW.context_prompt IS NOT DISTINCT FROM OLD.context_prompt THEN
    RETURN NEW;
  END IF;

  -- An empty prompt has nothing worth restoring; recording it would only pad
  -- the list between the versions that matter.
  IF OLD.context_prompt IS NULL OR btrim(OLD.context_prompt) = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
    FROM app.task_versions WHERE task_id = OLD.id;

  BEGIN
    actor := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    actor := NULL;
  END;

  INSERT INTO app.task_versions (task_id, version, context_prompt, created_by)
  VALUES (OLD.id, next_version, OLD.context_prompt, actor);

  RETURN NEW;
END;
$$;

CREATE TRIGGER task_prompt_version_trg
  BEFORE UPDATE ON app.tasks
  FOR EACH ROW
  EXECUTE FUNCTION app.record_task_prompt_version();

-- Seed the current wording as version 1. Without it the net is empty until the
-- second edit: the first save after this migration would push the live text
-- into history with nothing behind it to fall back to.
INSERT INTO app.task_versions (task_id, version, context_prompt, created_at)
SELECT id, 1, context_prompt, COALESCE(updated_at, created_at)
  FROM app.tasks
 WHERE context_prompt IS NOT NULL
   AND btrim(context_prompt) <> '';

ALTER TABLE app.task_versions ENABLE ROW LEVEL SECURITY;

-- Mirrors app.tasks: readable to any session, writable only by admins. In
-- practice nothing writes here but the trigger, which runs as definer.
CREATE POLICY task_versions_read_policy ON app.task_versions
  FOR SELECT USING (true);

CREATE POLICY task_versions_modify_policy ON app.task_versions
  FOR ALL USING (app.is_admin());
