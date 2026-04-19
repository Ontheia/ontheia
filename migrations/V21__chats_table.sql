CREATE TABLE IF NOT EXISTS app.chats (
  id text PRIMARY KEY,
  user_id uuid NULL,
  project_id uuid NULL,
  title text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NULL,
  default_agent_id uuid NULL,
  default_tool_approval text NULL,
  metadata jsonb NULL
);

CREATE INDEX IF NOT EXISTS chats_user_idx ON app.chats (user_id);
CREATE INDEX IF NOT EXISTS chats_project_idx ON app.chats (project_id);
CREATE INDEX IF NOT EXISTS chats_updated_idx ON app.chats (updated_at DESC);
