-- The state of an MCP server is shown from what happened last, not from the
-- last error ever written.
--
-- log_excerpt was written on a failed start and never cleared, so a server
-- that ran fine for weeks still showed an error from an earlier start, and an
-- admin took it for down. The excerpt now carries its time, and a short event
-- list per server records starts, stops and failures in order.

ALTER TABLE app.mcp_server_status
  ADD COLUMN IF NOT EXISTS log_excerpt_at timestamptz;

CREATE TABLE IF NOT EXISTS app.mcp_server_events (
  id bigserial PRIMARY KEY,
  name text NOT NULL REFERENCES app.mcp_server_configs(name) ON DELETE CASCADE ON UPDATE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('start_ok', 'start_failed', 'stop', 'crash')),
  message text,
  tool_count integer
);

CREATE INDEX IF NOT EXISTS mcp_server_events_name_at_idx
  ON app.mcp_server_events (name, at DESC);

COMMENT ON TABLE app.mcp_server_events IS
  'Recent lifecycle events per MCP server (start, stop, failure); kept to the newest 20 per server.';
