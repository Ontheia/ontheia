-- V65: Agent Skills
-- Skill catalog (metadata + body indexed from sources/skills/),
-- and agent-skill assignment table.

CREATE TABLE IF NOT EXISTS app.skills (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT        NOT NULL,
  description              TEXT        NOT NULL,
  when_to_use              TEXT,
  content                  TEXT        NOT NULL DEFAULT '',
  skill_dir                TEXT        NOT NULL,
  scope                    TEXT        NOT NULL DEFAULT 'user',
  owner_id                 UUID        REFERENCES app.users(id) ON DELETE CASCADE,
  disable_model_invocation BOOLEAN     NOT NULL DEFAULT false,
  user_invocable           BOOLEAN     NOT NULL DEFAULT true,
  model_override           TEXT,
  active                   BOOLEAN     NOT NULL DEFAULT true,
  scanned_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, scope, owner_id)
);

CREATE TABLE IF NOT EXISTS app.agent_skills (
  agent_id  UUID        NOT NULL REFERENCES app.agents(id)  ON DELETE CASCADE,
  skill_id  UUID        NOT NULL REFERENCES app.skills(id)  ON DELETE CASCADE,
  active    BOOLEAN     NOT NULL DEFAULT true,
  PRIMARY KEY (agent_id, skill_id)
);

ALTER TABLE app.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY skills_read_policy ON app.skills FOR SELECT TO ontheia_app
  USING (
    scope = 'global'
    OR owner_id = (current_setting('app.current_user_id', true))::uuid
    OR current_setting('app.user_role', true) = 'admin'
  );

CREATE POLICY skills_write_policy ON app.skills FOR ALL TO ontheia_app
  USING (
    owner_id = (current_setting('app.current_user_id', true))::uuid
    OR current_setting('app.user_role', true) = 'admin'
  )
  WITH CHECK (
    owner_id = (current_setting('app.current_user_id', true))::uuid
    OR current_setting('app.user_role', true) = 'admin'
  );

ALTER TABLE app.agent_skills ENABLE ROW LEVEL SECURITY;

-- All users can read agent-skill assignments (needed for RunService to load skills per agent).
-- Only admins can write (assign/remove skills from agents).
CREATE POLICY agent_skills_read_policy ON app.agent_skills FOR SELECT TO ontheia_app
  USING (true);

CREATE POLICY agent_skills_write_policy ON app.agent_skills FOR ALL TO ontheia_app
  USING (current_setting('app.user_role', true) = 'admin')
  WITH CHECK (current_setting('app.user_role', true) = 'admin');

CREATE INDEX IF NOT EXISTS skills_scope_idx    ON app.skills (scope);
CREATE INDEX IF NOT EXISTS skills_owner_idx    ON app.skills (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_skills_ag_idx ON app.agent_skills (agent_id);
