CREATE TABLE IF NOT EXISTS app.mcp_server_status (
    name TEXT PRIMARY KEY REFERENCES app.mcp_server_configs(name) ON DELETE CASCADE,
    status TEXT NOT NULL,
    last_started_at TIMESTAMPTZ,
    last_stopped_at TIMESTAMPTZ,
    exit_code INTEGER,
    signal TEXT,
    log_excerpt TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_server_status_status_idx
    ON app.mcp_server_status(status);
