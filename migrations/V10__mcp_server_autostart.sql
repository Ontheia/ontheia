ALTER TABLE app.mcp_server_configs
    ADD COLUMN IF NOT EXISTS auto_start BOOLEAN NOT NULL DEFAULT false;
