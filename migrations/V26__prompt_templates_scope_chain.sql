BEGIN;

ALTER TABLE app.prompt_templates
  DROP CONSTRAINT IF EXISTS prompt_templates_scope_check,
  DROP CONSTRAINT IF EXISTS prompt_templates_target_check;

ALTER TABLE app.prompt_templates
  ADD CONSTRAINT prompt_templates_scope_check CHECK (scope IN ('task', 'agent', 'chain', 'global')),
  ADD CONSTRAINT prompt_templates_target_check CHECK (
    (scope = 'global' AND target_id IS NULL)
    OR (scope IN ('task', 'agent', 'chain') AND target_id IS NOT NULL)
  );

COMMIT;
