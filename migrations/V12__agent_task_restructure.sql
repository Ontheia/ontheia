-- Agent/Task Konfigurationsumbau – Agent hält Provider/Tools, Task liefert Kontext
BEGIN;

-- Agenten um Provider-/Tool-Defaults erweitern
ALTER TABLE app.agents
    ADD COLUMN IF NOT EXISTS provider_id text,
    ADD COLUMN IF NOT EXISTS model_id text,
    ADD COLUMN IF NOT EXISTS default_tool_mode text NOT NULL DEFAULT 'prompt' CHECK (default_tool_mode IN ('prompt', 'granted', 'denied')),
    ADD COLUMN IF NOT EXISTS default_tool_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- MCP-Server-Bindungen pro Agent (aktiv gesetzte Server inkl. Konfiguration)
CREATE TABLE IF NOT EXISTS app.agent_mcp_servers (
    agent_id uuid NOT NULL REFERENCES app.agents(id) ON DELETE CASCADE,
    server text NOT NULL,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agent_id, server)
);

-- Tasks liefern künftig nur Kontextinformationen
ALTER TABLE app.tasks
    ADD COLUMN IF NOT EXISTS context_prompt text,
    ADD COLUMN IF NOT EXISTS context_tags text[] DEFAULT ARRAY[]::text[];

-- Task-spezifische Tool-Zuordnungen entfallen (Agent verwaltet Tools)
DROP TABLE IF EXISTS app.task_tools;

COMMIT;
