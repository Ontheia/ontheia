BEGIN;

CREATE TABLE IF NOT EXISTS app.prompt_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    scope text NOT NULL,
    target_id uuid,
    title text NOT NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prompt_templates_scope_check CHECK (scope IN ('task', 'agent', 'global')),
    CONSTRAINT prompt_templates_target_check CHECK (
        (scope = 'global' AND target_id IS NULL)
        OR (scope IN ('task', 'agent') AND target_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS prompt_templates_user_scope_idx
    ON app.prompt_templates (user_id, scope);

CREATE INDEX IF NOT EXISTS prompt_templates_scope_target_idx
    ON app.prompt_templates (scope, target_id);

CREATE INDEX IF NOT EXISTS prompt_templates_user_created_idx
    ON app.prompt_templates (user_id, created_at DESC);

COMMIT;
