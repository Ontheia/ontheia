BEGIN;

-- Chats Metadaten
CREATE TABLE IF NOT EXISTS app.chats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
    project_id uuid REFERENCES app.projects(id) ON DELETE SET NULL,
    title text NOT NULL DEFAULT '',
    last_run_id text,
    last_message_at timestamptz,
    default_agent text,
    default_tool_approval text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chats_user_idx ON app.chats(user_id);
CREATE INDEX IF NOT EXISTS chats_project_idx ON app.chats(project_id);
CREATE INDEX IF NOT EXISTS chats_last_message_idx ON app.chats(last_message_at);

-- Chat Messages (UI-Schicht, soft-deletefähig)
CREATE TABLE IF NOT EXISTS app.chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id uuid NOT NULL REFERENCES app.chats(id) ON DELETE CASCADE,
    run_id text,
    role text NOT NULL CHECK (role IN ('user', 'agent', 'system', 'tool')),
    content text NOT NULL DEFAULT '',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS chat_messages_chat_created_idx ON app.chat_messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_run_idx ON app.chat_messages(run_id);
CREATE INDEX IF NOT EXISTS chat_messages_metadata_gin ON app.chat_messages USING gin (metadata);

COMMIT;
