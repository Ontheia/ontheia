BEGIN;

CREATE TABLE IF NOT EXISTS app.mcp_server_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    config jsonb NOT NULL,
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_validated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_server_configs_name_idx
    ON app.mcp_server_configs (name);

COMMIT;
