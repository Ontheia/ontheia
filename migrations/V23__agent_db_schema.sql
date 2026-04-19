-- Agenten-DB-Schema: zentrale Tabelle + Berechtigungen und Pivot-Tabellen
BEGIN;

-- Agents: Label als Primärbezeichnung, Tool-Mode, Defaults/Metadaten
DO $$
BEGIN
  IF EXISTS(SELECT *
    FROM information_schema.columns
    WHERE table_schema = 'app'
    AND table_name = 'agents'
    AND column_name = 'name')
  THEN
      ALTER TABLE app.agents RENAME COLUMN name TO label;
  END IF;
END $$;

-- Label muss gesetzt sein (bestehende Daten übernehmen den bisherigen Namen)
UPDATE app.agents SET label = COALESCE(label, '') WHERE label IS NULL;
ALTER TABLE app.agents ALTER COLUMN label SET NOT NULL;

ALTER TABLE app.agents
    ADD COLUMN IF NOT EXISTS tool_approval_mode text CHECK (tool_approval_mode IN ('prompt', 'granted', 'denied')) DEFAULT 'prompt',
    ADD COLUMN IF NOT EXISTS default_mcp_servers text[] NOT NULL DEFAULT ARRAY[]::text[],
    ADD COLUMN IF NOT EXISTS default_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_by uuid;

UPDATE app.agents
   SET tool_approval_mode = COALESCE(tool_approval_mode, default_tool_mode, 'prompt')
 WHERE tool_approval_mode IS NULL;

UPDATE app.agents
   SET created_by = COALESCE(created_by, owner_id)
 WHERE created_by IS NULL;

ALTER TABLE app.agents ALTER COLUMN tool_approval_mode SET NOT NULL;
ALTER TABLE app.agents ALTER COLUMN updated_at SET DEFAULT now();

-- Berechtigungen: user/role → use/admin
CREATE TABLE IF NOT EXISTS app.agent_permissions (
    agent_id uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
    principal_type text NOT NULL CHECK (principal_type IN ('user', 'role')),
    principal_id text NOT NULL,
    access text NOT NULL DEFAULT 'use' CHECK (access IN ('use', 'admin')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    PRIMARY KEY (agent_id, principal_type, principal_id)
);

CREATE INDEX IF NOT EXISTS agent_permissions_principal_idx
    ON app.agent_permissions (principal_type, principal_id);

-- Pivot: Agent ↔ Tasks
CREATE TABLE IF NOT EXISTS app.agent_tasks (
    agent_id uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES app.tasks(id) ON DELETE CASCADE,
    is_default boolean NOT NULL DEFAULT false,
    position integer,
    active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    PRIMARY KEY (agent_id, task_id)
);

CREATE INDEX IF NOT EXISTS agent_tasks_task_idx ON app.agent_tasks (task_id);

-- Pivot: Agent ↔ Chains
CREATE TABLE IF NOT EXISTS app.agent_chains (
    agent_id uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
    chain_id uuid NOT NULL REFERENCES app.chains(id) ON DELETE CASCADE,
    is_default boolean NOT NULL DEFAULT false,
    position integer,
    active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    PRIMARY KEY (agent_id, chain_id)
);

CREATE INDEX IF NOT EXISTS agent_chains_chain_idx ON app.agent_chains (chain_id);

COMMIT;
